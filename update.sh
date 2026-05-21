#!/bin/bash
# update.sh — Pull latest code and redeploy without losing data
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest code"
git pull

echo "==> Rebuilding containers"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --remove-orphans

echo "==> Cleaning unused resources"
docker image prune -f
docker volume prune -f
docker builder prune --keep-storage 3GB -f

echo "✅  Update complete"
echo "    Disk: $(df -h / | awk 'NR==2{print $3" used / "$2" ("$5")"}')"
