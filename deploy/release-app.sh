#!/usr/bin/env bash
# Application release while Coolify owns the frontend (AYK-206, see docs/COOLIFY_RUNTIME.md).
# Run as root from the repo root:  bash deploy/release-app.sh
#
# The release steps of setup-server.sh, without the parts that belong to the shared ingress:
# database backup, a new client release in /var/www/aykdmh/releases, the API image, pending
# migrations, the API container, then the switch of /var/www/aykdmh/current (the Coolify
# frontend serves /srv/current from that folder, so it needs no restart). It never touches
# Coolify, the ingress (aykdmh-web), LiveKit, secrets, the firewall or the backup timer.
# Roll back the client:  ln -sfn releases/<older> /var/www/aykdmh/current
set -euo pipefail

SITE_ROOT=/var/www/aykdmh
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE=(docker compose -p aykdmh --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/docker-compose.yml")

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE; this script never creates secrets." >&2; exit 1; }
[[ -L "$SITE_ROOT/current" ]] || { echo "Missing $SITE_ROOT/current; not an existing installation." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx aykdmh-db || { echo "aykdmh-db is not running." >&2; exit 1; }
PREVIOUS="$(readlink "$SITE_ROOT/current")"

echo "== Database backup =="
mkdir -p /root/backups
docker exec aykdmh-db pg_dump -U aykdmh -d aykdmh -Fc > "/root/backups/aykdmh-db-$STAMP.dump"
echo "Saved /root/backups/aykdmh-db-$STAMP.dump"

echo "== Building client release $STAMP =="
COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)"
PREFIX="$(tr -dc '0-9.' < "$REPO_DIR/deploy/VERSION_PREFIX" 2>/dev/null || true)"
PREFIX="${PREFIX:-1.1}"
RELEASE_DIR=/var/lib/aykdmh
mkdir -p "$RELEASE_DIR"
RELEASE="$(tr -dc '0-9' < "$RELEASE_DIR/release-counter" 2>/dev/null || true)"
RELEASE="${RELEASE:-0}"
if [ "$COMMIT" != "$(cat "$RELEASE_DIR/release-commit" 2>/dev/null || true)" ]; then
    RELEASE=$((10#$RELEASE + 1))
    echo "$RELEASE" > "$RELEASE_DIR/release-counter"
    echo "$COMMIT" > "$RELEASE_DIR/release-commit"
fi
APP_VERSION="$PREFIX.$((10#$RELEASE))"
APP_BUILD="$COMMIT · $(date +%Y-%m-%d)"
echo "Version $APP_VERSION (build $APP_BUILD)"
docker run --rm -v "$REPO_DIR":/src -w /src \
    -e VITE_REALTIME_MODE=socket -e HOME=/tmp -e VITE_APP_VERSION="$APP_VERSION" -e VITE_APP_BUILD="$APP_BUILD" \
    node:22-bookworm sh -c "npm --prefix client ci --include=dev --no-audit --no-fund && npm --prefix client run build"
mkdir -p "$SITE_ROOT/releases/$STAMP"
cp -r "$REPO_DIR/client/dist/." "$SITE_ROOT/releases/$STAMP/"
chmod -R a+rX "$SITE_ROOT/releases/$STAMP"

echo "== API and migrations =="
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" run --rm --no-deps app node -e "
require('./server/services/installService').setupFromEnv().then(r => {
  const errors = r.migrations.flatMap(m => m.errors);
  if (errors.length) { console.error('Migration errors:', errors.length); process.exit(1); }
  console.log('Database ready. Administrators:', r.admins);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });"
"${COMPOSE[@]}" up -d --no-deps app

echo "== Switching to release $STAMP (was $PREVIOUS) =="
ln -sfn "releases/$STAMP" "$SITE_ROOT/current"
echo "Done: $APP_VERSION. Roll back the client with:  ln -sfn $PREVIOUS $SITE_ROOT/current"
echo "Restore the database with:  docker exec -i aykdmh-db pg_restore -U aykdmh -d aykdmh --clean < /root/backups/aykdmh-db-$STAMP.dump"
