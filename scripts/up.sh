#!/usr/bin/env bash
# Sobe o Balcão inteiro desta cópia: Postgres próprio, migrations, seed, API, worker e front.
# Pode rodar de novo sem derrubar antes: reaproveita portas e reinicia só os processos desta cópia.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

mkdir -p "$PIDS" "$LOGS" "$UPLOADS"

# 1. Hook do Git (versionado em .githooks/).
git -C "$ROOT" config core.hooksPath .githooks

# 2. Processos antigos desta cópia saem antes de checar as portas.
stop_processes

# 3. Portas: reaproveita as gravadas se continuarem livres; senão escolhe outras.
DB_PORT='' API_PORT='' WEB_PORT=''
# shellcheck disable=SC1090
[ -f "$SAVED_ENV" ] && . "$SAVED_ENV"
db_running=$(compose ps -q --status running db 2>/dev/null || true)
if [ -z "$DB_PORT" ] || { [ -z "$db_running" ] && port_busy "$DB_PORT"; }; then
  DB_PORT=$(pick_port 5432)
fi
if [ -z "$API_PORT" ] || port_busy "$API_PORT"; then API_PORT=$(pick_port 4000 "$DB_PORT"); fi
if [ -z "$WEB_PORT" ] || port_busy "$WEB_PORT"; then WEB_PORT=$(pick_port 5173 "$DB_PORT" "$API_PORT"); fi
printf 'DB_PORT=%s\nAPI_PORT=%s\nWEB_PORT=%s\n' "$DB_PORT" "$API_PORT" "$WEB_PORT" > "$SAVED_ENV"

API_URL="http://localhost:$API_PORT"
WEB_URL="http://localhost:$WEB_PORT"
DATABASE_URL="postgresql://balcao:balcao@localhost:$DB_PORT/balcao"

# 4. Dependências: npm ci (respeita o lockfile) só quando o lockfile muda.
for dir in "$ROOT" "$ROOT/api" "$ROOT/web"; do
  [ -f "$dir/package-lock.json" ] || continue
  stamp="$STATE/lock-$(basename "$dir").sha"
  sum=$(git hash-object "$dir/package-lock.json")
  if [ ! -d "$dir/node_modules" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$sum" ]; then
    echo "> npm ci em ${dir#"$ROOT"/}"
    (cd "$dir" && npm ci --no-audit --no-fund > "$LOGS/npm-ci-$(basename "$dir").log" 2>&1) ||
      { echo "npm ci falhou; veja $LOGS/npm-ci-$(basename "$dir").log" >&2; exit 1; }
    echo "$sum" > "$stamp"
  fi
done

# 5. api/.env desta cópia (mantém chaves não gerenciadas, como OPENAI_API_KEY).
[ -f "$ROOT/api/.env" ] || cp "$ROOT/api/.env.example" "$ROOT/api/.env"
set_kv "$ROOT/api/.env" DATABASE_URL "$DATABASE_URL"
set_kv "$ROOT/api/.env" DATABASE_URL_TEST "postgresql://balcao:balcao@localhost:$DB_PORT/balcao_test"
set_kv "$ROOT/api/.env" PORT "$API_PORT"
set_kv "$ROOT/api/.env" UPLOAD_DIR "$UPLOADS"
set_kv "$ROOT/api/.env" WEB_ORIGIN "$WEB_URL"

# 6. Banco desta cópia, migrations e seed (idempotente).
echo "> Postgres ($ID) na porta $DB_PORT"
DB_PORT=$DB_PORT compose up -d --wait > "$LOGS/compose.log" 2>&1 ||
  { cat "$LOGS/compose.log" >&2; exit 1; }
(cd "$ROOT/api" && npx prisma generate > "$LOGS/prisma.log" 2>&1 &&
  npx prisma migrate deploy >> "$LOGS/prisma.log" 2>&1 && npm run seed >> "$LOGS/prisma.log" 2>&1) ||
  { tail -20 "$LOGS/prisma.log" >&2; exit 1; }

# 7. API, worker e front, cada um no próprio grupo de processos (set -m), com cwd explícito.
set -m
start() {
  local name=$1 dir=$2
  shift 2
  # stdin em /dev/null: no macOS o nohup não faz isso, e o vite parado lendo o terminal (SIGTTIN) trava a subida.
  (cd "$dir" && exec nohup "$@" < /dev/null > "$LOGS/$name.log" 2>&1) &
  echo $! > "$PIDS/$name.pid"
}
start api "$ROOT/api" npm run dev
start worker "$ROOT/api" npm run worker
VITE_API_URL=$API_URL start web "$ROOT/web" npm run dev -- --port "$WEB_PORT" --strictPort
set +m

# 8. Espera a API (com banco) e o front responderem.
wait_http() {
  local url=$1 name=$2 i=0
  until node -e "fetch('$url',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; do
    i=$((i + 1))
    if [ $i -ge 60 ]; then
      echo "$name não respondeu em $url; últimas linhas de $LOGS/$name.log:" >&2
      tail -20 "$LOGS/$name.log" >&2
      exit 1
    fi
    sleep 1
  done
}
wait_http "$API_URL/api/health" api
wait_http "$WEB_URL" web
kill -0 "$(cat "$PIDS/worker.pid")" 2>/dev/null || { tail -20 "$LOGS/worker.log" >&2; exit 1; }

cat <<EOF

Balcão no ar (cópia $ID)
  API:     $API_URL
  Front:   $WEB_URL
  Banco:   $DATABASE_URL (projeto docker compose $ID)
  Anexos:  $UPLOADS
  Logs:    $LOGS
Derrubar: npm run down
EOF
