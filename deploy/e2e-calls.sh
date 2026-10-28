#!/usr/bin/env bash
# Real end-to-end call test on the server, without touching production data:
# an isolated staging app + database (removed afterwards) using the live LiveKit
# server, and two Chromium browsers with fake media devices.
# Usage (as root, from the deployed repo): bash deploy/e2e-calls.sh
# Chat test (text, voice message, location): E2E_SCRIPT=chat.e2e.mjs bash deploy/e2e-calls.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$REPO_DIR/.env"; set +a
NET=aykdmh_default
DB=ayk-stg-db APP=ayk-stg-app
cleanup() { docker rm -f "$DB" "$APP" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

STG_SECRET=$(openssl rand -hex 48)
docker run -d --name "$DB" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker run -d --name "$APP" --network "$NET" \
  -e NODE_ENV=production -e APP_PORT=5000 -e APP_URL="http://$APP:5000" -e CLIENT_URL="http://$APP:5000" \
  -e DB_HOST="$DB" -e DB_NAME=postgres -e DB_USER=postgres -e DB_PASSWORD= -e DB_SSL=false \
  -e JWT_SECRET="$STG_SECRET" -e LIVEKIT_URL=wss://aykdmh.com/livekit -e LIVEKIT_API_URL=http://livekit:7880 \
  -e LIVEKIT_API_KEY=aykdmh -e LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET" \
  -v /var/www/aykdmh/current/:/app/client/dist:ro aykdmh-app:latest >/dev/null

SEED=$(docker exec "$APP" node -e "
const install = require('./server/services/installService');
const db = require('./server/config/database');
const jwt = require('./server/utils/jwt');
const Conversation = require('./server/models/Conversation');
(async () => {
  await install.setupFromEnv();
  const add = async (name, role) => (await db.query('INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)', [name, role + Math.random().toString(36).slice(2) + '@e2e.invalid', 'unused', role])).insertId;
  const c = await add('عميل تجريبي', 'client'), p = await add('مقدم تجريبي', 'provider'), o = await add('مستخدم ثالث', 'client');
  await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [p]);
  const r = (await db.query(\"INSERT INTO requests (client_id, title, description, assigned_provider_id, status) VALUES (?, ?, ?, ?, 'assigned')\", [c, 'طلب اختبار', 'اختبار مكالمة', p])).insertId;
  const conv = await Conversation.findOrCreateBetween(c, p, r);
  const t = (id, role) => jwt.sign({ id, role, auth_version: 0 });
  console.log(JSON.stringify({ conv, client: t(c, 'client'), provider: t(p, 'provider'), outsider: t(o, 'client') }));
  await db.getPool().end();
})().catch(e => { console.error(e); process.exit(1); });" | tail -1)

val() { python3 -c "import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]])" "$SEED" "$1"; }
docker run --rm --network "$NET" --ipc=host -v "$REPO_DIR/e2e":/e2e -w /e2e \
  -e BASE="http://$APP:5000" -e CONV="$(val conv)" -e CLIENT="$(val client)" -e PROVIDER="$(val provider)" -e OUTSIDER="$(val outsider)" \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -c "npm init -y >/dev/null && npm i --no-audit --no-fund playwright@1.63.0 >/dev/null 2>&1 && node ${E2E_SCRIPT:-calls.e2e.mjs}"
