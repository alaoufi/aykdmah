#!/usr/bin/env bash
# AYK-166: disposable, offline runtime; never reads .env or production volumes.
# First run deploy/run-tests.sh on this Git checkout to build client/dist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?Usage: bash deploy/store-screenshots.sh /absolute/output-directory}"
[[ "$OUT" = /* ]] || { echo 'Output must be absolute'; exit 1; }
test -f "$ROOT/client/dist/index.html"
test -d "$ROOT/node_modules/playwright"
mkdir -p "$OUT"
PREFIX="ayk-shots-$$"
DB="$PREFIX-db"; APP="$PREFIX-app"; NET="$PREFIX-net"; IMAGE="$PREFIX:local"
cleanup() {
  docker rm -f "$APP" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker build -q -t "$IMAGE" -f "$ROOT/deploy/app.Dockerfile" "$ROOT" >/dev/null
docker network create --internal "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
SECRET=$(openssl rand -hex 48)
docker run -d --name "$APP" --network "$NET" \
  -e NODE_ENV=production -e AUTO_MIGRATE=false -e APP_PORT=5000 \
  -e APP_URL="http://$APP:5000" -e CLIENT_URL="http://$APP:5000" \
  -e DB_HOST="$DB" -e DB_NAME=postgres -e DB_USER=postgres -e DB_SSL=false \
  -e JWT_SECRET="$SECRET" -v "$ROOT/client/dist:/app/client/dist:ro" "$IMAGE" >/dev/null
# Seed only this newly created database. The token is transient and never logged.
SEED=$(docker exec -i "$APP" node < "$ROOT/e2e/store-seed.cjs" | tail -1)
TOKEN=$(printf '%s' "$SEED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
CONV=$(printf '%s' "$SEED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["conversation"])')
docker run --rm --network "$NET" --ipc=host -v "$ROOT:/src:ro" -v "$OUT:/out" -w /src \
  -e BASE="http://$APP:5000" -e CLIENT="$TOKEN" -e CONV="$CONV" \
  -e SOURCE_COMMIT="$(git -C "$ROOT" rev-parse HEAD)" \
  -e BROWSER="${BROWSER:-chromium}" \
  mcr.microsoft.com/playwright:v1.63.0-noble node "${E2E_SCRIPT:-e2e/store-screenshots.mjs}"
