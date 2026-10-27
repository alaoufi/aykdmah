#!/usr/bin/env bash
# Publish aykdmh.com on the Contabo VPS (Ubuntu 24.04 with Docker + private Coolify).
# Run as root from the repo root:  sudo bash deploy/setup-server.sh
# Safe to re-run: each run publishes a new release; older ones stay for rollback.
# Does not touch Coolify, SSH settings, or existing firewall rules.
set -euo pipefail

SITE_ROOT=/var/www/aykdmh
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }

if ! docker ps --format '{{.Names}}' | grep -qx aykdmh-web; then
    if ss -H -ltn '( sport = :80 or sport = :443 )' | grep -q .; then
        echo "Ports 80/443 are used by another service; stopping." >&2; exit 1
    fi
fi

echo "== Backing up firewall rules =="
mkdir -p /root/backups
tar czf "/root/backups/ufw-$STAMP.tgz" -C /etc ufw
echo "Saved /root/backups/ufw-$STAMP.tgz"

echo "== Allowing web traffic (SSH rule unchanged) =="
if ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp comment 'aykdmh web'
    ufw allow 443/tcp comment 'aykdmh web'
    ufw allow 443/udp comment 'aykdmh web'
fi

echo "== Publishing site as release $STAMP =="
mkdir -p "$SITE_ROOT/releases/$STAMP"
cp -r "$REPO_DIR/deploy/landing/." "$SITE_ROOT/releases/$STAMP/"
chmod -R a+rX "$SITE_ROOT"
# Relative link so it resolves inside the container too.
ln -sfn "releases/$STAMP" "$SITE_ROOT/current"

echo "== Starting web server =="
docker compose -p aykdmh -f "$REPO_DIR/deploy/docker-compose.yml" up -d
docker exec aykdmh-web caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

echo "Done. Releases are in $SITE_ROOT/releases; roll back with:"
echo "  ln -sfn releases/<older> $SITE_ROOT/current"
