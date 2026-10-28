#!/usr/bin/env bash
# Daily backup of aykdmh.com (AYK-015), run by the aykdmh-backup systemd timer that
# setup-server.sh installs. Run by hand as root: bash deploy/backup.sh
#
# Saves to /root/backups/daily/<stamp>/: the database (pg_dump custom format, verified
# by listing it), the uploaded files volume and the server .env (secrets; root only).
# Keeps the last KEEP_DAYS daily sets, and removes deploy-time dumps older than 30 days.
#
# Off-server copy (optional): put BACKUP_REMOTE=user@host:/path in /root/aykdmh-backup.conf
# (an SSH target the owner controls, with key login set up for root). Each set is then
# copied there with rsync over SSH. Nothing is sent anywhere when it is not set.
set -euo pipefail

KEEP_DAYS=14
BASE=/root/backups
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BASE/daily/$STAMP"
CONF=/root/aykdmh-backup.conf
BACKUP_REMOTE=""
[[ -f "$CONF" ]] && . "$CONF"

umask 077
mkdir -p "$DEST"
log() { echo "[$(date '+%F %T')] $*"; }

log "database"
docker exec aykdmh-db pg_dump -U aykdmh -d aykdmh -Fc > "$DEST/db.dump"
# A dump that cannot be listed is not a backup.
docker exec -i aykdmh-db pg_restore --list < "$DEST/db.dump" > /dev/null
log "uploads"
docker run --rm -v aykdmh_uploads:/data:ro -v "$DEST":/out alpine:3.20 tar czf /out/uploads.tgz -C /data .
cp "$REPO_DIR/.env" "$DEST/env"
(cd "$DEST" && sha256sum db.dump uploads.tgz env > SHA256SUMS)
log "saved $DEST ($(du -sh "$DEST" | cut -f1))"

if [[ -n "$BACKUP_REMOTE" ]]; then
    log "copying off-server"
    rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$DEST" "$BACKUP_REMOTE/"
    log "copied to remote"
fi

# Rotation: newest KEEP_DAYS daily sets stay.
ls -1d "$BASE"/daily/*/ 2>/dev/null | sort | head -n -"$KEEP_DAYS" | xargs -r rm -rf
find "$BASE" -maxdepth 1 -type f \( -name 'aykdmh-db-*.dump' -o -name 'ufw-*.tgz' \) -mtime +30 -delete
log "done"
