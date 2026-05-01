#!/bin/bash
# deploy.sh — First-time VPS setup for CRM SaaS
# Tested on Ubuntu 22.04 / 24.04 (Hostinger VPS)
# Usage: bash deploy.sh yourdomain.com your@email.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: bash deploy.sh yourdomain.com your@email.com"
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> [1/6] Installing system packages"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl gnupg ca-certificates

# Docker
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
fi

# Docker Compose plugin
if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

echo "==> [2/6] Configuring .env.prod"
if [[ ! -f "$APP_DIR/.env.prod" ]]; then
  cp "$APP_DIR/.env.prod.example" "$APP_DIR/.env.prod"
  # Substitute domain placeholders
  sed -i "s|YOURDOMAIN.com|$DOMAIN|g" "$APP_DIR/.env.prod"
  # Generate random secrets
  JWT=$(openssl rand -hex 32)
  JWT_REFRESH=$(openssl rand -hex 32)
  DB_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  sed -i "s|CHANGE_ME_at_least_32_random_chars|$JWT|" "$APP_DIR/.env.prod"
  sed -i "s|CHANGE_ME_different_32_random_chars|$JWT_REFRESH|" "$APP_DIR/.env.prod"
  sed -i "s|CHANGE_ME_strong_password|$DB_PASS|g" "$APP_DIR/.env.prod"
  sed -i "s|CHANGE_ME_redis_password|$REDIS_PASS|g" "$APP_DIR/.env.prod"
  echo "    .env.prod created — review and fill in API keys before proceeding"
  echo "    Press ENTER when ready..."
  read -r
fi

echo "==> [3/6] Configuring Nginx (HTTP only, for Certbot)"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location / { return 200 'ok'; }
}
NGINX
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [4/6] Obtaining SSL certificate (Let's Encrypt)"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> [5/6] Installing production Nginx config"
# Replace the temporary config with the full production one
sed "s/YOURDOMAIN/$DOMAIN/g" "$APP_DIR/nginx.conf.template" > "$NGINX_CONF"
nginx -t && systemctl reload nginx

echo "==> [6/6] Building and starting Docker containers"
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml --env-file .env.prod pull --ignore-pull-failures || true
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo ""
echo "✅  Deployment complete!"
echo "    App:  https://$DOMAIN"
echo "    API:  https://$DOMAIN/api"
echo ""
echo "    To view logs:  docker compose -f docker-compose.prod.yml logs -f"
echo "    To update:     git pull && bash update.sh"
