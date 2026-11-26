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
