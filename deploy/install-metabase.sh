#!/usr/bin/env bash
# Metabase for reports (AYK-499), read-only on the live database. Run as root on the server:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/install-metabase.sh
# What it does: creates the read-only role aykdmah_report (deploy/metabase-readonly.sql) with a random password kept in
# /etc/aykdmah/metabase.env (mode 600, never printed, never in Git), starts the containers aykdmah-metabase and
# aykdmah-mb-db, and checks that the role can read payments but not users' phone numbers and cannot write.
# What it never touches: the live site's containers and data (it only READS through the role), the gateway, DNS.
# Open http://127.0.0.1:8104 through an SSH tunnel (ssh -L 8104:127.0.0.1:8104 <server>); the FIRST visitor creates the
# administrator account in Metabase, so do it right after the install. Then add the database with the host/port/user
# printed at the end (the password is in /etc/aykdmah/metabase.env as REPORT_PASSWORD).
#   --stop / --start   pause or resume          Remove everything: bash deploy/remove-metabase.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/aykdmah/metabase.env
PORT=8104
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
compose() { docker compose -p aykdmah-metabase --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/metabase.compose.yml" "$@"; }
case "${1:-}" in
  --stop)  compose stop; echo "DONE: Metabase is paused"; exit 0 ;;
  --start) compose start; echo "DONE: Metabase is running"; exit 0 ;;
  "") ;;
  *) echo "unknown option: $1"; exit 1 ;;
esac

docker inspect aykdmah-db >/dev/null 2>&1 || { echo "NOT READY: the live database container aykdmah-db is not running"; exit 1; }
owner="$(docker ps --filter "publish=$PORT" --format '{{.Names}}' | head -1)"
if [[ -n "$owner" && "$owner" != aykdmah-metabase ]]; then echo "NOT READY: port $PORT is used by container $owner"; exit 1; fi
LIVE_NETWORK="$(docker inspect aykdmah-db --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
[[ -n "$LIVE_NETWORK" ]] || { echo "NOT READY: cannot find the live database network"; exit 1; }

saved() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1='\(.*\)'$/\1/p" "$ENV_FILE" | head -1 || true; }
MB_PG_PASSWORD="$(saved MB_PG_PASSWORD)"; [[ -n "$MB_PG_PASSWORD" ]] || MB_PG_PASSWORD="$(openssl rand -hex 24)"
REPORT_PASSWORD="$(saved REPORT_PASSWORD)"; [[ -n "$REPORT_PASSWORD" ]] || REPORT_PASSWORD="$(openssl rand -hex 24)"
install -d -m 700 /etc/aykdmah
umask 077
cat > "$ENV_FILE.new" <<ENV
# Metabase settings (deploy/install-metabase.sh). Secrets: never copy into Git or a chat.
MB_PG_PASSWORD='$MB_PG_PASSWORD'
REPORT_PASSWORD='$REPORT_PASSWORD'
LIVE_NETWORK='$LIVE_NETWORK'
ENV
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"

echo "== Read-only role on the live database (SELECT only; nothing is changed in the data) =="
DB_USER="$(docker exec aykdmah-db printenv POSTGRES_USER)"; DB_NAME="$(docker exec aykdmah-db printenv POSTGRES_DB)"
docker exec -i aykdmah-db psql -q -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -v report_password="$REPORT_PASSWORD" < "$REPO_DIR/deploy/metabase-readonly.sql"

echo "== Checking the role =="
rq() { docker exec -e PGPASSWORD="$REPORT_PASSWORD" aykdmah-db psql -h 127.0.0.1 -U aykdmah_report -d "$DB_NAME" -tAc "$1" 2>&1 || true; }
[[ "$(rq 'select count(*) >= 0 from payments')" == t ]] || { echo "NOT READY: the role cannot read payments"; exit 1; }
for q in "select phone from users limit 1" "select password_hash from users limit 1" "select iban from withdrawal_requests limit 1" "select * from messages limit 1" "update payments set amount = amount"; do
  out="$(rq "$q")"
  if ! grep -qiE "permission denied|read-only" <<<"$out"; then echo "NOT READY: the role was allowed: $q"; exit 1; fi
done
echo "OK   reads payments; refused phone, password hash, IBAN, messages, and any write"

echo "== Starting Metabase =="
LIVE_NETWORK="$LIVE_NETWORK" compose pull -q
LIVE_NETWORK="$LIVE_NETWORK" compose up -d --force-recreate
ok=0
for _ in $(seq 1 60); do
  sleep 3
  [[ "$(curl -s --noproxy 127.0.0.1 -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/api/health" || true)" == 200 ]] && { ok=1; break; }
done
[[ "$ok" == 1 ]] || { echo "NOT READY: Metabase did not answer. Last lines:"; docker logs --tail 15 aykdmah-metabase 2>&1 || true; exit 1; }
echo "OK   Metabase answers on 127.0.0.1:$PORT"
echo "DONE. Open it through an SSH tunnel and create the administrator account NOW (the first visitor becomes the administrator)."
echo "     Add database: PostgreSQL, host aykdmah-db, port 5432, name $DB_NAME, user aykdmah_report, password = REPORT_PASSWORD in $ENV_FILE"
unset REPORT_PASSWORD MB_PG_PASSWORD
