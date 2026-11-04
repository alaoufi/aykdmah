#!/usr/bin/env bash
set -euo pipefail
umask 077
SRC=/tmp/ayk175-verified
for n in $(seq 1 180); do
  if [ -s /tmp/ayk175-verified-suite.exit ]; then
    test "$(cat /tmp/ayk175-verified-suite.exit)" = 0 || { echo CANDIDATE_SUITE_FAILED; exit 2; }
    break
  fi
  if [ "$n" = 180 ]; then echo CANDIDATE_BUILD_NOT_READY; exit 2; fi
  sleep 2
done
test -s "$SRC/client/dist/index.html"
test ! -e "$SRC/.env" && test ! -e "$SRC/.env.local"
PREFIX="ayk175-calls-$(date +%s)-$(openssl rand -hex 3)"
[[ "$PREFIX" =~ ^ayk175-calls-[0-9]+-[a-f0-9]{6}$ ]]
WORK="/tmp/$PREFIX"
NET="$PREFIX-net"; DB="$PREFIX-db"; LK="$PREFIX-lk"; APP="$PREFIX-app"; BROWSER="$PREFIX-browser"
mkdir -m 700 "$WORK"
cp -a "$SRC/." "$WORK/"
OUT="$WORK/docs/call-review/ayk175-isolated"; mkdir -p "$OUT"
cleanup() {
  result=$?
  if [ -n "${CUT_HELPER_PID:-}" ] && jobs -pr | grep -Fxq "$CUT_HELPER_PID"; then kill "$CUT_HELPER_PID" >/dev/null 2>&1 || true; fi
  for container in "$APP" "$LK"; do docker logs "$container" > "$OUT/${container##*-}.log" 2>&1 || true; done
  docker rm -f "$BROWSER" "$APP" "$LK" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  printf '%s\n' "$result" > "$OUT/exit-code.txt"
  printf 'ISOLATED_CALLS_DONE work=%s exit=%s\n' "$WORK" "$result"
}
trap cleanup EXIT
printf 'ISOLATED_CALLS_START work=%s\n' "$WORK"
printf "socket (same as deploy/setup-server.sh)\n" > "$OUT/build-mode.txt"
docker run --rm --network none -v "$WORK:/src" -w /src -e VITE_REALTIME_MODE=socket node:22-bookworm npm run build > "$OUT/browser-build.log" 2>&1
docker network create --internal "$NET" > /dev/null
SUBNET=$(docker network inspect "$NET" --format '{{(index .IPAM.Config 0).Subnet}}')
LKIP=$(python3 -c 'import ipaddress,sys; print(ipaddress.ip_network(sys.argv[1]).network_address+10)' "$SUBNET")
LKKEY="test$(openssl rand -hex 10)"; LKSECRET=$(openssl rand -hex 40); JWT=$(openssl rand -hex 48)
cat > "$WORK/livekit.yaml" <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: false
keys:
  $LKKEY: $LKSECRET
logging:
  level: info
EOF
cat > "$WORK/app.env" <<EOF
NODE_ENV=production
AUTO_MIGRATE=false
APP_PORT=5000
APP_URL=http://$APP:5000
CLIENT_URL=http://$APP:5000
DB_HOST=$DB
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=
DB_SSL=false
DATABASE_URL=
DIRECT_DATABASE_URL=
JWT_SECRET=$JWT
LIVEKIT_URL=ws://$LK:7880
LIVEKIT_API_URL=http://$LK:7880
LIVEKIT_API_KEY=$LKKEY
LIVEKIT_API_SECRET=$LKSECRET
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PASSWORD=
MAIL_HOST=
WHATSAPP_PROVIDER=
PAYMENT_PROVIDER=
PUSH_PUBLIC_KEY=
PUSH_PRIVATE_KEY=
GOOGLE_MAPS_API_KEY=
API_RATE_LIMIT=10000
EOF
cp /tmp/ayk175-calls-seed.cjs "$WORK/local-call-seed.cjs"
cp /tmp/ayk175-calls-runtime-adapt.cjs "$WORK/local-call-adapt.cjs"
docker run -d --name "$DB" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for n in $(seq 1 30); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker run -d --name "$LK" --network "$NET" --ip "$LKIP" -v "$WORK/livekit.yaml:/livekit.yaml:ro" livekit/livekit-server:v1.13.9 --config /livekit.yaml --node-ip "$LKIP" --bind 0.0.0.0 >/dev/null
docker run --rm --network "$NET" --env-file "$WORK/app.env" -v "$WORK:/src" -w /src node:22-bookworm node local-call-seed.cjs > "$WORK/seed-private.json" 2> "$OUT/seed-error.log"
python3 - "$WORK/seed-private.json" "$WORK/browser.env" "$APP" <<'PY'
import json,sys
seed=json.loads(open(sys.argv[1]).read().splitlines()[-1])
with open(sys.argv[2],'w') as f:
 f.write('BASE=http://'+sys.argv[3]+':5000\n')
 for env,key in [('CONV','conv'),('CLIENT','client'),('PROVIDER','provider'),('OUTSIDER','outsider')]: f.write(env+'='+str(seed[key])+'\n')
 f.write('OUT=/src/docs/call-review/ayk175-isolated\n')
PY
docker run -d --name "$APP" --network "$NET" --env-file "$WORK/app.env" -v "$WORK:/src" -w /src node:22-bookworm node server/server.js >/dev/null
for n in $(seq 1 40); do
 if docker exec "$APP" node -e 'fetch("http://127.0.0.1:5000/api/countries").then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then break; fi
 sleep 1
done
docker run --rm --network none -v "$WORK:/src" -w /src node:22-bookworm node local-call-adapt.cjs
# Only this run's SFU is disconnected, never production or the app/database.
(
  for n in $(seq 1 600); do [ -f "$OUT/sfu-cut.ready" ] && break; sleep 0.25; done
  if [ ! -f "$OUT/sfu-cut.ready" ]; then exit 0; fi
  docker network disconnect "$NET" "$LK"
  printf 'ISOLATED_SFU_DISCONNECTED\n'
  sleep 18
  docker network connect --ip "$LKIP" "$NET" "$LK"
  printf 'restored\n' > "$OUT/sfu-cut.done"
  printf 'ISOLATED_SFU_RESTORED\n'
) > "$OUT/network-events.log" 2>&1 &
CUT_HELPER_PID=$!
# No host networking, published ports, production volumes, or external SFU.
set +e
docker run --rm --name "$BROWSER" --network "$NET" --shm-size=1g --env-file "$WORK/browser.env" -v "$WORK:/src" -w /src mcr.microsoft.com/playwright:v1.63.0-noble timeout 300s node e2e/calls-isolated.e2e.mjs > "$OUT/run.log" 2>&1
result=$?
set -e
printf '%s\n' "$result" > "$OUT/browser-exit.txt"
# Only non-sensitive result lines leave the isolated log file.
grep -E '^(PASS |FAIL |[0-9]+/[0-9]+ checks passed)' "$OUT/run.log" || true
exit "$result"
