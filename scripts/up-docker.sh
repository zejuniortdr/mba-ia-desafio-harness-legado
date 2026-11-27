#!/usr/bin/env bash
# Alternativa ao `npm run up`: API, worker e front em containers (node:22), com o código montado do host.
# Mesmo isolamento por cópia: projeto compose, portas em .balcao/env e anexos em .balcao/uploads.
# Pode rodar de novo sem derrubar antes. Derrubar: npm run down.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

mkdir -p "$PIDS" "$LOGS" "$UPLOADS"

# Hook do Git (versionado em .githooks/).
git -C "$ROOT" config core.hooksPath .githooks

# O modo host e o modo docker da mesma cópia não rodam juntos: para os dois antes de checar as portas.
stop_processes
stop_app_containers
choose_ports

export HOST_UID HOST_GID UPLOADS_DIR
HOST_UID=$(id -u)
HOST_GID=$(id -g)
UPLOADS_DIR=$UPLOADS
# Chaves opcionais do api/.env (ex.: AI_MODE=openai) valem também no container.
if [ -f "$ROOT/api/.env" ]; then
  for key in AI_MODE OPENAI_API_KEY JWT_SECRET; do
    value=$(grep -E "^$key=" "$ROOT/api/.env" | tail -1 | cut -d= -f2- || true)
    [ -n "$value" ] && export "$key=$value"
  done
fi

echo "> Postgres ($ID) na porta $DB_PORT"
compose up -d --wait db > "$LOGS/compose.log" 2>&1 || { cat "$LOGS/compose.log" >&2; exit 1; }

echo "> setup no container (npm ci se preciso, prisma, migrations e seed)"
COMPOSE_PROFILES=app compose run --rm setup > "$LOGS/docker-setup.log" 2>&1 ||
  { tail -30 "$LOGS/docker-setup.log" >&2; exit 1; }

COMPOSE_PROFILES=app compose up -d --force-recreate api worker web > "$LOGS/compose.log" 2>&1 ||
  { cat "$LOGS/compose.log" >&2; exit 1; }

show_log() { COMPOSE_PROFILES=app compose logs --tail 20 "$1"; }
wait_http "$API_URL/api/health" api
wait_http "$WEB_URL" web
[ -n "$(COMPOSE_PROFILES=app compose ps -q --status running worker)" ] || { show_log worker >&2; exit 1; }

print_summary "docker compose -p $ID logs -f api worker web"
