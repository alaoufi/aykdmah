#!/usr/bin/env bash
# Daily backup of aykdmh.com (AYK-015), run by the aykdmh-backup systemd timer that
# setup-server.sh installs. Run by hand as root: bash deploy/backup.sh
#
# Saves to /root/backups/daily/<stamp>/: the database (pg_dump custom format, verified
# by listing it), the uploaded files volume, the server .env (secrets; root only), the full code
# (git bundle of every branch), files not in Git, and /etc/aykdmh with the aykdmh systemd units.
# Keeps the last KEEP_DAYS daily sets, and removes deploy-time dumps older than 30 days.
#
# Off-server copy in Cloudflare R2, encrypted (AYK-247): see deploy/r2-setup.sh.
# Off-server copy over SSH (optional): put BACKUP_REMOTE=user@host:/path in /root/aykdmh-backup.conf
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
BACKUP_SSH_KEY=""
[[ -f "$CONF" ]] && . "$CONF"

umask 077
log() { echo "[$(date '+%F %T')] $*"; }

# One backup at a time (AYK-304): the nightly timer and «take a backup now» never overlap.
exec 9> /run/aykdmh-backup.lock
flock -n 9 || { log "another backup is running: skipped"; exit 0; }

# Progress for the backups page (AYK-304): /var/lib/aykdmh/backup-requests/status.json, read by the API.
# BACKUP_TRIGGER=manual is set by aykdmh-backup-now.service; the nightly timer leaves it unset.
TRIGGER="${BACKUP_TRIGGER:-timer}"
STATUS_DIR=/var/lib/aykdmh/backup-requests
STARTED="$(date -u +%FT%TZ)"
BACKUP_NAME=""
MEDIA_NOTE=""
UPLOAD_FAILED=0
status() { # state step [finished]
    [[ -d "$STATUS_DIR" ]] || return 0
    printf '{"state":"%s","step":"%s","trigger":"%s","started":"%s","updated":"%s","finished":"%s","backup":"%s","media":"%s"}\n' \
        "$1" "$2" "$TRIGGER" "$STARTED" "$(date -u +%FT%TZ)" "${3:-}" "$BACKUP_NAME" "$MEDIA_NOTE" > "$STATUS_DIR/.status.tmp"
    chmod 644 "$STATUS_DIR/.status.tmp" && mv -f "$STATUS_DIR/.status.tmp" "$STATUS_DIR/status.json"
}
CURRENT_STEP=start
trap 'rc=$?; [[ $rc -ne 0 ]] && status failed "$CURRENT_STEP" "$(date -u +%FT%TZ)"' EXIT
step() { CURRENT_STEP="$1"; status running "$1"; log "$1"; }

mkdir -p "$DEST"
step "database"
docker exec aykdmh-db pg_dump -U aykdmh -d aykdmh -Fc > "$DEST/db.dump"
# A dump that cannot be listed is not a backup.
docker exec -i aykdmh-db pg_restore --list < "$DEST/db.dump" > /dev/null
step "uploads"
docker run --rm -v aykdmh_uploads:/data:ro -v "$DEST":/out alpine:3.20 tar czf /out/uploads.tgz -C /data .
cp "$REPO_DIR/.env" "$DEST/env"
# The whole code with its history, instructions (CLAUDE.md, AGENTS.md, docs) and every branch, as
# it is on the server (owner's decision 2026-11-17: a backup is the database plus the full code
# with all its secrets). Restore: git clone code.bundle aykdmh
step "code"
git -C "$REPO_DIR" bundle create "$DEST/code.bundle" --all 2>/dev/null
git -C "$REPO_DIR" bundle verify "$DEST/code.bundle" > /dev/null 2>&1
# Files on the server that are not in Git (secrets, local settings), without dependencies or builds
# (node_modules, dist, compat-assets are rebuilt from the code).
(cd "$REPO_DIR" && git ls-files --others -z | { grep -zvE '(^|/)(node_modules|dist|build|__pycache__|\.cache|compat-assets)/' || true; } \
  | tar czf "$DEST/local-files.tgz" --null -T -)
# Server settings of aykdmh: /etc/aykdmh (R2 key; never the backup encryption key itself), its
# systemd units (backup, security export), the release counter (/var/lib/aykdmh), and the Android
# app's signing key with its passwords (/root/aykdmh-android/keys, AYK-274): without it the app in
# Google Play cannot be updated until Google resets the upload key.
tar czf "$DEST/server-settings.tgz" --exclude='backup-encryption.key*' /etc/aykdmh \
  $(ls /etc/systemd/system/aykdmh-* 2>/dev/null) \
  $(ls -d /var/lib/aykdmh /root/aykdmh-android/keys 2>/dev/null) 2>/dev/null
# Instructions for any developer: what is in the set and how to rebuild the site from it.
cp "$REPO_DIR/docs/RESTORE.md" "$DEST/README-RESTORE.md"
(cd "$DEST" && sha256sum db.dump uploads.tgz env code.bundle local-files.tgz server-settings.tgz README-RESTORE.md > SHA256SUMS)
log "saved $DEST ($(du -sh "$DEST" | cut -f1))"

if [[ -n "$BACKUP_REMOTE" ]]; then
    log "copying off-server"
    # A key used only for backups (AYK-165): BACKUP_SSH_KEY=/root/.ssh/aykdmh_backup in the conf.
    rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${BACKUP_SSH_KEY:+-i $BACKUP_SSH_KEY}" "$DEST" "$BACKUP_REMOTE/"
    log "copied to remote"
    # The off-server copy keeps the same number of days (AYK-165).
    ssh -o BatchMode=yes ${BACKUP_SSH_KEY:+-i $BACKUP_SSH_KEY} "${BACKUP_REMOTE%%:*}" \
        "find '${BACKUP_REMOTE#*:}' -mindepth 1 -maxdepth 1 -type d -mtime +$KEEP_DAYS -exec rm -rf {} +" || log "remote rotation skipped"
fi

# Off-server encrypted copy in Cloudflare R2 (AYK-247), when deploy/r2-setup.sh has been run.
# The set (database, uploads, .env, code, server settings) is encrypted on this server (AES-256, key in
# /etc/aykdmh/backup-encryption.key, kept by the owner too) before upload; R2 keeps 30 days.
R2_ENV=/etc/aykdmh/r2.env
R2_KEY=/etc/aykdmh/backup-encryption.key
if [[ -s "$R2_ENV" && -s "$R2_KEY" ]]; then
    step "encrypting"
    mkdir -p "$BASE/offsite"
    # A manual backup says so in its name, so the page never takes it for the nightly one.
    # (An if, not `[[ ]] && echo`: under set -e a false test inside $(...) would stop the nightly run.)
    SUFFIX=""; if [[ "$TRIGGER" == manual ]]; then SUFFIX="-manual"; fi
    ENC="$BASE/offsite/aykdmh-$STAMP$SUFFIX.tar.enc"
    BACKUP_NAME="$(basename "$ENC")"
    tar cf - -C "$BASE/daily" "$STAMP" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$R2_KEY" -out "$ENC"
    R2_BUCKET="$(sed -n 's/^R2_BUCKET=//p' "$R2_ENV")"
    rc() { docker run --rm --network host --env-file "$R2_ENV" -v "$BASE/offsite":/data rclone/rclone:1.68.2 --bind 0.0.0.0 -q "$@"; }
    step "uploading"
    if rc copyto "/data/$(basename "$ENC")" "r2:$R2_BUCKET/daily/$(basename "$ENC")"; then
        log "uploaded to R2: daily/$(basename "$ENC") ($(du -h "$ENC" | cut -f1))"
        rc delete --min-age 30d "r2:$R2_BUCKET/daily/" || log "R2 rotation skipped"
    else
        log "R2 UPLOAD FAILED (the local set is kept)"
        UPLOAD_FAILED=1
    fi
    rm -f "$ENC"

    # Members' media (AYK-304). With R2_MEDIA_* in .env, chat and request photos, voice notes and clips
    # live in the R2 bucket aykdmh-media, not in the database, so the database dump does not hold them.
    # Each backup copies that bucket into this backups bucket under media/current/: only new or changed
    # files travel. A file deleted from the site is moved to media/deleted/<stamp>/ and kept 30 days.
    # The copy is not encrypted again: the media are stored the same way in their own private bucket.
    media_get() { sed -n "s/^$1=//p" "$REPO_DIR/.env" | tail -1 | sed "s/^[\"']//; s/[\"']\$//"; }
    M_BUCKET="$(media_get R2_MEDIA_BUCKET)"; M_KEY="$(media_get R2_MEDIA_ACCESS_KEY_ID)"
    M_SECRET="$(media_get R2_MEDIA_SECRET_ACCESS_KEY)"; M_ENDPOINT="$(media_get R2_MEDIA_ENDPOINT)"
    if [[ -n "$M_BUCKET" && -n "$M_KEY" && -n "$M_SECRET" && -n "$M_ENDPOINT" ]]; then
        step "media"
        MEDIA_ENV="$(mktemp /run/aykdmh-media-rclone.XXXXXX)"
        { cat "$R2_ENV"; printf 'RCLONE_CONFIG_MEDIA_TYPE=s3\nRCLONE_CONFIG_MEDIA_PROVIDER=Cloudflare\nRCLONE_CONFIG_MEDIA_ENDPOINT=%s\nRCLONE_CONFIG_MEDIA_ACCESS_KEY_ID=%s\nRCLONE_CONFIG_MEDIA_SECRET_ACCESS_KEY=%s\nRCLONE_CONFIG_MEDIA_NO_CHECK_BUCKET=true\n' \
            "$M_ENDPOINT" "$M_KEY" "$M_SECRET"; } > "$MEDIA_ENV"
        mrc() { docker run --rm --network host --env-file "$MEDIA_ENV" rclone/rclone:1.68.2 --bind 0.0.0.0 -q "$@"; }
        if mrc sync "media:$M_BUCKET" "r2:$R2_BUCKET/media/current" --backup-dir "r2:$R2_BUCKET/media/deleted/$STAMP" --transfers 8; then
            MEDIA_NOTE="$(mrc size --json "r2:$R2_BUCKET/media/current" 2>/dev/null | tr -d '\n"{} ' || true)"
            log "media copied to R2: media/current ($MEDIA_NOTE)"
            mrc delete --min-age 30d "r2:$R2_BUCKET/media/deleted/" || log "media rotation skipped"
            mrc rmdirs --leave-root "r2:$R2_BUCKET/media/deleted/" 2>/dev/null || true
        else
            MEDIA_NOTE="failed"
            log "MEDIA COPY FAILED (the rest of the backup is kept)"
        fi
        rm -f "$MEDIA_ENV"
    else
        MEDIA_NOTE="in-database"
    fi
fi

# Rotation: newest KEEP_DAYS daily sets stay.
ls -1d "$BASE"/daily/*/ 2>/dev/null | sort | head -n -"$KEEP_DAYS" | xargs -r rm -rf
find "$BASE" -maxdepth 1 -type f \( -name 'aykdmh-db-*.dump' -o -name 'ufw-*.tgz' \) -mtime +30 -delete
if [[ "$UPLOAD_FAILED" == 1 ]]; then status failed uploading "$(date -u +%FT%TZ)"; else status done finished "$(date -u +%FT%TZ)"; fi
log "done"
