#!/usr/bin/env bash
# Bootstrap aykdmh.com on a fresh Ubuntu/Debian VPS (Contabo).
# Run as root from the repo root:  sudo bash deploy/setup-server.sh you@example.com
# Safe to re-run. Backs up existing nginx config before touching it and never
# closes the SSH port.
set -euo pipefail

DOMAIN=aykdmh.com
EMAIL="${1:-}"
SITE_ROOT=/var/www/aykdmh
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
if [[ -z "$EMAIL" ]]; then echo "Usage: $0 <email-for-letsencrypt>" >&2; exit 1; fi

echo "== Backing up current nginx config =="
if [[ -d /etc/nginx ]]; then
    mkdir -p /root/backups
    tar czf "/root/backups/nginx-$STAMP.tgz" -C /etc nginx
    echo "Saved /root/backups/nginx-$STAMP.tgz"
fi

echo "== Installing packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx curl

echo "== Opening firewall for web traffic (SSH stays open) =="
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
fi

echo "== Publishing homepage as release $STAMP =="
mkdir -p "$SITE_ROOT/releases/$STAMP"
cp -r "$REPO_DIR/deploy/landing/." "$SITE_ROOT/releases/$STAMP/"
ln -sfn "$SITE_ROOT/releases/$STAMP" "$SITE_ROOT/current"
chown -R www-data:www-data "$SITE_ROOT"

echo "== Configuring nginx =="
# Keep any 443 block certbot already wrote; only install our config on first run.
if [[ ! -f /etc/nginx/sites-available/$DOMAIN ]]; then
    cp "$REPO_DIR/deploy/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN"
fi
ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "== Requesting TLS certificate =="
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring

echo "== Checking =="
curl -fsSI "https://$DOMAIN" | head -1
echo "Done. Previous releases are in $SITE_ROOT/releases; roll back with:"
echo "  ln -sfn $SITE_ROOT/releases/<older> $SITE_ROOT/current && systemctl reload nginx"
