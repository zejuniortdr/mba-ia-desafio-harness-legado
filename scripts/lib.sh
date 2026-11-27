# Funções comuns de up.sh e down.sh. Compatível com bash 3.2 (macOS).
# Cada cópia (clone ou worktree) tem a própria identidade, portas, banco, anexos e processos.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
STATE="$ROOT/.balcao"
PIDS="$STATE/pids"
LOGS="$STATE/logs"
UPLOADS="$STATE/uploads"
SAVED_ENV="$STATE/env"

# Nome do projeto docker compose: pasta da cópia + hash do caminho absoluto.
copy_id() {
  local name hash
  name=$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')
  hash=$(printf '%s' "$ROOT" | git hash-object --stdin | cut -c1-6)
  echo "balcao-${name}-${hash}"
}

ID=$(copy_id)

compose() {
  docker compose -p "$ID" -f "$ROOT/docker-compose.yml" "$@"
}

# Porta ocupada = alguém aceita conexão nela (IPv4 ou IPv6).
port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && return 0
  return 1
}

# Primeira porta livre a partir de $1, pulando as já escolhidas nesta subida ($2...).
pick_port() {
  local p=$1
  shift
  while port_busy "$p" || case " $* " in *" $p "*) true ;; *) false ;; esac; do
    p=$((p + 1))
  done
  echo "$p"
}

# Para os processos desta cópia: cada um roda no próprio grupo de processos.
stop_processes() {
  local f pid i
  [ -d "$PIDS" ] || return 0
  for f in "$PIDS"/*.pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f")
    if kill -0 -- "-$pid" 2>/dev/null; then
      kill -TERM -- "-$pid" 2>/dev/null || true
      i=0
      while kill -0 -- "-$pid" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  done
}

# Troca (ou acrescenta) KEY=valor num arquivo .env.
set_kv() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp)
  grep -v "^${key}=" "$file" > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$file"
}

# Containers api/worker/web do modo docker desta cópia (perfil "app" do compose).
stop_app_containers() {
  COMPOSE_PROFILES=app compose stop api worker web > /dev/null 2>&1 || true
}

# Escolhe as portas da cópia: reaproveita as gravadas em .balcao/env se continuarem livres.
choose_ports() {
  local db_running
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
  export DB_PORT API_PORT WEB_PORT
  API_URL="http://localhost:$API_PORT"
  WEB_URL="http://localhost:$WEB_PORT"
  DATABASE_URL="postgresql://balcao:balcao@localhost:$DB_PORT/balcao"
}

# Espera uma URL responder 2xx (até 60 s); se não, mostra o log do serviço (show_log, de quem chama).
wait_http() {
  local url=$1 name=$2 i=0
  until node -e "fetch('$url',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; do
    i=$((i + 1))
    if [ $i -ge 60 ]; then
      echo "$name não respondeu em $url; últimas linhas do log:" >&2
      show_log "$name" >&2
      echo "O que já subiu continua no ar: rode npm run down antes de tentar de novo." >&2
      exit 1
    fi
    sleep 1
  done
}

print_summary() {
  cat <<EOF

Balcão no ar (cópia $ID)
  API:     $API_URL
  Front:   $WEB_URL
  Banco:   $DATABASE_URL (projeto docker compose $ID)
  Anexos:  $UPLOADS
  Logs:    $1
Derrubar: npm run down
EOF
}
