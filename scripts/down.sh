#!/usr/bin/env bash
# Derruba tudo que o up desta cópia iniciou: API, worker, front e o Postgres desta cópia.
# Não mexe em outras cópias. Os dados do banco ficam no volume para a próxima subida.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

stop_processes
compose down > /dev/null 2>&1 || true
echo "Balcão derrubado (cópia $ID)."
