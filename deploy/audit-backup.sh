#!/usr/bin/env bash
# Audit, backup and restore proof for aykdmh.com (AYK-234). Run as root on the server:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/audit-backup.sh [--encrypt]
#
# 1. Evidence (read only): which database the running API uses, its identity, migrations
#    and activity. Prints names, counts and timestamps only: never passwords, connection
#    strings or customer content.
# 2. A full backup with deploy/backup.sh (database, uploaded files, server .env; root only).
# 3. Restore proof: the dump is restored into a throwaway container with no network, every
#    table's row count is compared with production, and the uploads archive is listed and
#    compared with the volume. The throwaway container is removed afterwards.
# 4. --encrypt: one AES-256 file of that backup for keeping off the server (asks for a
#    passphrase; keep it in a password manager, it is not stored anywhere).
#
# Changes nothing in production: no restart, no migration, no write to the live database.
set -uo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR=/root/backups/audit
REPORT="$REPORT_DIR/audit-$STAMP.txt"
umask 077
mkdir -p "$REPORT_DIR"
exec > >(tee "$REPORT") 2>&1

DB_CONTAINER=aykdmh-db
APP_CONTAINER=aykdmh-app
psql_prod() { docker exec "$DB_CONTAINER" psql -U aykdmh -d aykdmh -Atq -c "$1"; }
COUNT_SQL="SELECT table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"

echo "== aykdmh audit $STAMP on $(hostname) =="

echo; echo "== 1. Code on the server and the published version =="
git -C /opt/aykdmh rev-parse --abbrev-ref HEAD
git -C /opt/aykdmh log -1 --format='%H %cs %s'
echo "local changes: $(git -C /opt/aykdmh status --porcelain | wc -l)"
echo "published: $(curl -fsS --max-time 10 https://aykdmh.com/version.json || echo unavailable)"
echo "api health: $(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 https://aykdmh.com/api/health || echo unavailable)"

echo; echo "== 2. Containers =="
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'

echo; echo "== 3. Which database the running API uses (names and non-secret values only) =="
APP_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CONTAINER")"
for name in DB_HOST DB_PORT DB_NAME DB_USER DB_SSL NODE_ENV; do
  echo "$name=$(printf '%s\n' "$APP_ENV" | sed -n "s/^$name=//p")"
done
for name in DATABASE_URL DIRECT_DATABASE_URL; do
  if printf '%s\n' "$APP_ENV" | grep -q "^$name=."; then echo "$name: SET (an external database would take priority — investigate)"; else echo "$name: not set"; fi
done
echo "all variable names: $(printf '%s\n' "$APP_ENV" | cut -d= -f1 | sort | tr '\n' ' ')"
echo "app networks: $(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$APP_CONTAINER")"
echo "db image: $(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")"
echo "db volume: $(docker inspect -f '{{range .Mounts}}{{.Name}}:{{.Destination}} {{end}}' "$DB_CONTAINER")"
echo "db aliases on the app network: $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.Aliases}} {{end}}' "$DB_CONTAINER")"

echo; echo "== 4. Database identity, migrations and activity =="
psql_prod "SELECT 'database ' || current_database() || ', size ' || pg_size_pretty(pg_database_size(current_database())) || ', ' || split_part(version(), ',', 1)"
echo "databases on this server: $(docker exec "$DB_CONTAINER" psql -U aykdmh -d aykdmh -Atq -c "SELECT string_agg(datname, ' ' ORDER BY datname) FROM pg_database WHERE NOT datistemplate")"
psql_prod "SELECT 'migrations applied: ' || count(*) || ', last: ' || max(name) || ' at ' || max(applied_at) FROM schema_migrations"
echo "migrations in the code: $(ls /opt/aykdmh/database/migrations/*.sql | wc -l), last: $(ls /opt/aykdmh/database/migrations/*.sql | sort | tail -1 | xargs basename)"
psql_prod "SELECT 'last activity: user ' || COALESCE((SELECT max(created_at)::text FROM users), '-') || ', request ' || COALESCE((SELECT max(created_at)::text FROM requests), '-') || ', message ' || COALESCE((SELECT max(created_at)::text FROM messages), '-')"
psql_prod "SELECT 'active connections: ' || count(*) FROM pg_stat_activity WHERE datname = current_database()"
echo "other database containers on this server (not used by aykdmh unless listed above):"
docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'postgres|mysql|mariadb|mongo' | awk -v own="$DB_CONTAINER" '$1 != own' | grep . || echo "  none"
psql_prod "$COUNT_SQL" > "$REPORT_DIR/prod-counts-$STAMP.txt"
echo "tables: $(wc -l < "$REPORT_DIR/prod-counts-$STAMP.txt") (row counts in $REPORT_DIR/prod-counts-$STAMP.txt)"

echo; echo "== 5. Backup settings =="
echo "daily timer: $(systemctl is-active aykdmh-backup.timer 2>/dev/null || echo unknown)"
if [[ -f /root/aykdmh-backup.conf ]] && grep -q '^BACKUP_REMOTE=.' /root/aykdmh-backup.conf; then echo "off-server copy: configured"; else echo "off-server copy: NOT configured"; fi
echo "uploads volume: $(docker volume ls --format '{{.Name}}' | grep -E '^aykdmh_uploads$' || echo missing)"

echo; echo "== 6. Full backup =="
if ! bash /opt/aykdmh/deploy/backup.sh; then echo "BACKUP FAILED — stop here"; exit 1; fi
SET="$(ls -1d /root/backups/daily/*/ | sort | tail -1)"; SET="${SET%/}"
echo "backup set: $SET"
cat "$SET/SHA256SUMS"

echo; echo "== 7. Restore proof in a throwaway container (no network) =="
TEST=ayk-restore-test-$STAMP
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")"
docker run -d --name "$TEST" --network none -e POSTGRES_PASSWORD=restore-test-only -e POSTGRES_USER=aykdmh -e POSTGRES_DB=aykdmh "$IMAGE" > /dev/null
cleanup() { docker rm -f "$TEST" > /dev/null 2>&1 || true; }
trap cleanup EXIT
for _ in $(seq 1 60); do docker exec "$TEST" pg_isready -U aykdmh -d aykdmh > /dev/null 2>&1 && break; sleep 1; done
sleep 2
docker exec -i "$TEST" pg_restore -U aykdmh -d aykdmh --no-owner --exit-on-error < "$SET/db.dump" \
  && echo "restore: OK" || echo "restore: FAILED"
docker exec "$TEST" psql -U aykdmh -d aykdmh -Atq -c "$COUNT_SQL" > "$REPORT_DIR/restored-counts-$STAMP.txt"
# Counts can differ only by rows written between the count and the dump (live site).
if diff "$REPORT_DIR/prod-counts-$STAMP.txt" "$REPORT_DIR/restored-counts-$STAMP.txt" > "$REPORT_DIR/count-diff-$STAMP.txt"; then
  echo "row counts: identical in all $(wc -l < "$REPORT_DIR/prod-counts-$STAMP.txt") tables"
else
  echo "row counts: differences (expected only in tables written during the backup):"; cat "$REPORT_DIR/count-diff-$STAMP.txt"
fi
docker exec "$TEST" psql -U aykdmh -d aykdmh -Atq -c "SELECT 'restored migrations: ' || count(*) || ', last: ' || max(name) FROM schema_migrations"
FILES_LIVE="$(docker run --rm -v aykdmh_uploads:/data:ro alpine:3.20 sh -c 'find /data -type f | wc -l')"
FILES_BACKUP="$(tar tzf "$SET/uploads.tgz" | grep -v '/$' | wc -l)"
echo "uploaded files: volume $FILES_LIVE, backup $FILES_BACKUP"
cleanup; trap - EXIT
echo "throwaway container removed"

if [[ "${1:-}" == "--encrypt" ]]; then
  echo; echo "== 8. Encrypted copy for keeping off the server =="
  mkdir -p /root/backups/export
  OUT="/root/backups/export/aykdmh-backup-$STAMP.tar.enc"
  tar cf - -C "$(dirname "$SET")" "$(basename "$SET")" -C "$REPORT_DIR" "audit-$STAMP.txt" "prod-counts-$STAMP.txt" \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -out "$OUT"
  sha256sum "$OUT"
  echo "download it to your computer (PowerShell):  scp root@84.247.166.216:$OUT ."
  echo "open it later:  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in $(basename "$OUT") | tar xf -"
fi

echo; echo "== done. Report: $REPORT =="
