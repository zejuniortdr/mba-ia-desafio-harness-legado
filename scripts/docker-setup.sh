#!/usr/bin/env bash
# Roda dentro do container "setup" do modo docker (ver docker-compose.yml), como root.
# Instala dependências nos volumes da cópia, gera o Prisma Client, migra e roda a seed (idempotente).
set -euo pipefail

for dir in /app/api /app/web; do
  stamp="$dir/node_modules/.lock-sha"
  sum=$(sha1sum "$dir/package-lock.json" | cut -d' ' -f1)
  if [ "$(cat "$stamp" 2>/dev/null)" != "$sum" ]; then
    echo "> npm ci em ${dir#/app/}"
    (cd "$dir" && npm ci --no-audit --no-fund)
    echo "$sum" > "$stamp"
  fi
done

cd /app/api
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts

# Os outros containers rodam com o UID/GID de quem subiu: node_modules e anexos ficam com esse dono.
chown -R "$HOST_UID:$HOST_GID" /app/api/node_modules /app/web/node_modules /uploads
