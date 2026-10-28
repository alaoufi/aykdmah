#!/usr/bin/env bash
# Deploy aykdmh.com on the Contabo VPS (Ubuntu 24.04 with Docker + private Coolify).
# Run as root from the repo root:  bash deploy/setup-server.sh
# Safe to re-run: backs up the database first, builds the client into a new release
# (older releases stay for rollback), rebuilds the API and applies pending migrations.
# Does not touch Coolify, SSH settings, or existing firewall rules.
set -euo pipefail

SITE_ROOT=/var/www/aykdmh
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE=(docker compose -p aykdmh --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/docker-compose.yml")

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }

if ! docker ps --format '{{.Names}}' | grep -qx aykdmh-web; then
    if ss -H -ltn '( sport = :80 or sport = :443 )' | grep -q .; then
        echo "Ports 80/443 are used by another service; stopping." >&2; exit 1
    fi
fi

mkdir -p /root/backups

echo "== Secrets =="
if [[ ! -f "$ENV_FILE" ]]; then
    umask 077
    {
        echo "DB_PASSWORD=$(openssl rand -hex 24)"
        echo "JWT_SECRET=$(openssl rand -hex 48)"
        echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
    } > "$ENV_FILE"
    echo "Generated $ENV_FILE (keep it; losing ENCRYPTION_KEY breaks stored integration secrets)."
    cp "$ENV_FILE" "/root/backups/aykdmh-env-$STAMP"
else
    echo "Using existing $ENV_FILE"
fi
# Added after the first release; appended once without touching existing secrets.
if ! grep -q '^LIVEKIT_API_SECRET=' "$ENV_FILE"; then
    echo "LIVEKIT_API_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE"
    cp "$ENV_FILE" "/root/backups/aykdmh-env-$STAMP"
    echo "Added LIVEKIT_API_SECRET to $ENV_FILE"
fi
# Web Push (VAPID) key pair for incoming-call notifications: a P-256 key generated locally.
if ! grep -q '^PUSH_PRIVATE_KEY=' "$ENV_FILE"; then
    docker run --rm node:22-bookworm node -e "
const k = require('crypto').generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = k.publicKey.export({ format: 'jwk' }), priv = k.privateKey.export({ format: 'jwk' });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
console.log('PUSH_PUBLIC_KEY=' + point.toString('base64url'));
console.log('PUSH_PRIVATE_KEY=' + priv.d);" >> "$ENV_FILE"
    cp "$ENV_FILE" "/root/backups/aykdmh-env-$STAMP"
    echo "Added Web Push keys to $ENV_FILE"
fi
chmod 600 "$ENV_FILE"

echo "== Backups =="
tar czf "/root/backups/ufw-$STAMP.tgz" -C /etc ufw
if docker ps --format '{{.Names}}' | grep -qx aykdmh-db; then
    docker exec aykdmh-db pg_dump -U aykdmh -d aykdmh -Fc > "/root/backups/aykdmh-db-$STAMP.dump"
    echo "Saved /root/backups/aykdmh-db-$STAMP.dump"
fi

echo "== Firewall (SSH rule unchanged) =="
if ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp comment 'aykdmh web' >/dev/null
    ufw allow 443/tcp comment 'aykdmh web' >/dev/null
    ufw allow 443/udp comment 'aykdmh web' >/dev/null
    ufw allow 7881/tcp comment 'aykdmh calls ICE/TCP' >/dev/null
    ufw allow 7882/udp comment 'aykdmh calls media' >/dev/null
    ufw allow 3478/udp comment 'aykdmh calls TURN' >/dev/null
fi

echo "== Building client release $STAMP =="
# Shown in the site footer: the deployed commit and the deployment date.
APP_VERSION="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo dev) · $(date +%Y-%m-%d)"
docker run --rm -v "$REPO_DIR":/src -w /src \
    -e ONNXRUNTIME_NODE_INSTALL_CUDA=skip -e VITE_REALTIME_MODE=socket -e HOME=/tmp -e VITE_APP_VERSION="$APP_VERSION" \
    node:22-bookworm sh -c "npm --prefix client ci --include=dev --no-audit --no-fund && npm --prefix client run build"
mkdir -p "$SITE_ROOT/releases/$STAMP"
cp -r "$REPO_DIR/client/dist/." "$SITE_ROOT/releases/$STAMP/"
chmod -R a+rX "$SITE_ROOT"

echo "== Starting database and API =="
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" up -d --wait db
"${COMPOSE[@]}" run --rm --no-deps app node -e "
require('./server/services/installService').setupFromEnv().then(r => {
  const errors = r.migrations.flatMap(m => m.errors);
  if (errors.length) { console.error('Migration errors:', errors.length); process.exit(1); }
  console.log('Database ready. Administrators:', r.admins);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });"
"${COMPOSE[@]}" up -d livekit
"${COMPOSE[@]}" up -d app

echo "== Switching to release $STAMP =="
# Relative link so it resolves inside the container too.
ln -sfn "releases/$STAMP" "$SITE_ROOT/current"
"${COMPOSE[@]}" up -d web
docker exec aykdmh-web caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

echo "== Daily backup timer (AYK-015) =="
cat > /etc/systemd/system/aykdmh-backup.service <<UNIT
[Unit]
Description=aykdmh.com daily backup (database, uploads, .env)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $REPO_DIR/deploy/backup.sh
StandardOutput=append:/var/log/aykdmh-backup.log
StandardError=append:/var/log/aykdmh-backup.log
UNIT
cat > /etc/systemd/system/aykdmh-backup.timer <<UNIT
[Unit]
Description=Run the aykdmh.com backup every night

[Timer]
# 00:30 UTC = 03:30 Saudi time, the quietest hour.
OnCalendar=*-*-* 00:30:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now aykdmh-backup.timer >/dev/null

echo "Done. Roll back the client with:"
echo "  ln -sfn releases/<older> $SITE_ROOT/current"
echo "Restore the database with:"
echo "  docker exec -i aykdmh-db pg_restore -U aykdmh -d aykdmh --clean < /root/backups/aykdmh-db-<stamp>.dump"
echo "Nightly backups: /root/backups/daily/<stamp>/ (db.dump, uploads.tgz, env); log /var/log/aykdmh-backup.log"
