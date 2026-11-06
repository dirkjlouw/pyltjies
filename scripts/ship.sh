#!/usr/bin/env bash
# Ship Pyltjies from this machine to the server and (re)start it.
#   ./scripts/ship.sh user@your-host          (or set PYLTJIES_HOST)
# Copies the project with rsync, rebuilds the image on the server, restarts, then checks health.
# Data lives in a Docker volume on the server and is never touched by a ship.
# Only ship from a clean main, after a snapshot of the host, and with the owner's go-ahead.
set -euo pipefail

HOST="${1:-${PYLTJIES_HOST:-}}"
DIR="${PYLTJIES_DIR:-/opt/pyltjies}"
[ -n "$HOST" ] || { echo "usage: $0 user@host   (or set PYLTJIES_HOST)"; exit 1; }
cd "$(dirname "$0")/.."

echo "→ syncing files to $HOST:$DIR"
ssh "$HOST" "mkdir -p '$DIR'"
rsync -az --delete \
  --exclude .git --exclude .claude --exclude compose.local.yaml --exclude node_modules --exclude data --exclude backups --exclude .env \
  ./ "$HOST:$DIR/"

echo "→ building and restarting"
ssh "$HOST" "cd '$DIR' && [ -f .env ] || cp .env.example .env; cd '$DIR' && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "→ waiting for health check"
for i in $(seq 1 20); do
  if ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' pyltjies" 2>/dev/null | grep -q healthy; then
    echo "✓ Pyltjies is up on $HOST"
    exit 0
  fi
  sleep 2
done
echo "✗ Pyltjies did not become healthy. Logs:"
ssh "$HOST" "cd '$DIR' && docker compose logs --tail 50 pyltjies"
exit 1
