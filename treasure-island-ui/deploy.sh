#!/bin/bash
# Local-build deploy — builds the Docker image on your Mac and transfers it to the
# server, avoiding any build load on the live VPS. Migrations are applied from
# your Mac too, since DATABASE_URL already points to the live DB.
#
# Usage:  cd treasure-island-ui && ./deploy.sh
set -euo pipefail

IMAGE=treasure-island-ui-app:latest
TAR=/tmp/treasure-island-ui-app.tar
SERVER=forge@88.222.244.232
REMOTE_DIR=/home/forge/studio.luminousdemo.com/current/treasure-island-ui

echo "==> Applying pending DB migrations (against live DB)..."
# Use docker-run psql to apply any new migration SQL files.
# Tracks which ones were applied via a _applied_migrations table on the live DB.
APPLIED=$(docker exec ai-studio-postgres psql \
  "postgresql://ai_studio:ai_studio_pw@88.222.244.232:5433/ai_studio" \
  -t -c "CREATE TABLE IF NOT EXISTS _applied_migrations(name text primary key, applied_at timestamptz default now()); SELECT name FROM _applied_migrations;" 2>/dev/null \
  | awk 'NF' | tr -d ' ')

for dir in prisma/migrations/0*/; do
  name=$(basename "$dir")
  if echo "$APPLIED" | grep -qx "$name"; then
    continue
  fi
  if [ -f "$dir/migration.sql" ]; then
    echo "    applying $name..."
    docker exec -i ai-studio-postgres psql \
      "postgresql://ai_studio:ai_studio_pw@88.222.244.232:5433/ai_studio" \
      < "$dir/migration.sql" > /dev/null
    docker exec ai-studio-postgres psql \
      "postgresql://ai_studio:ai_studio_pw@88.222.244.232:5433/ai_studio" \
      -c "INSERT INTO _applied_migrations(name) VALUES('$name') ON CONFLICT DO NOTHING;" > /dev/null
  fi
done

echo "==> Building image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile.app \
  -t "$IMAGE" \
  --load \
  .

echo "==> Saving image to $TAR..."
docker save "$IMAGE" -o "$TAR"
SIZE=$(du -h "$TAR" | cut -f1)
echo "    image tar: $SIZE"

echo "==> Transferring to server..."
scp -C "$TAR" "$SERVER:/tmp/"

echo "==> Loading image and restarting on server..."
ssh "$SERVER" "
  docker load -i /tmp/treasure-island-ui-app.tar
  rm /tmp/treasure-island-ui-app.tar
  cd $REMOTE_DIR
  # Ensure env symlink + port patches are in place (as in /home/forge/deploy.sh)
  ln -sf /home/forge/studio.luminousdemo.com/.env.local .env.local
  sed -i 's|\"6379:6379\"|\"6380:6379\"|' docker-compose.yml
  sed -i 's|\"3000:3000\"|\"3002:3000\"|' docker-compose.yml
  sed -i 's|./public/generated:/app/public/generated|/home/forge/studio.luminousdemo.com/shared/public/generated:/app/public/generated|' docker-compose.yml
  docker compose up -d app
  sleep 5
  docker compose ps
"

rm -f "$TAR"
echo "==> Done. https://studio.luminousdemo.com"
