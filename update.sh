#!/bin/bash
# update.sh — Pull latest code and redeploy without losing data
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest code"
git pull

echo "==> Rebuilding containers"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --remove-orphans

echo "==> Cleaning old images"
docker image prune -f

echo "✅  Update complete"
