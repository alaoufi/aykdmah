#!/usr/bin/env bash
# The admin area's backups report (AYK-271) reads the backups bucket with a READ-ONLY key. This puts
# that key into /opt/aykdmh/.env without ever showing it, after checking it can list the backups.
# Create it first in Cloudflare: R2 -> Manage API tokens -> Create API token -> "Object Read only",
# "Apply to specific buckets only": aykdmh-backups, Client IP Address Filtering: 84.247.166.216.
# (The same read-only key can also be given to the backups page: server-edge backups-monitor/add-site.sh.)
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/r2-backups-read-setup.sh
# The report shows it from the next release (deploy/release-app.sh). A copy of the previous .env is
# kept in /root/backups (mode 600).
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/aykdmh/.env}"
[[ $EUID -eq 0 || -n "${ENV_FILE_TEST:-}" ]] || { echo "Run as root."; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "NOT READY: $ENV_FILE not found; nothing changed"; exit 1; }

read -r -p "Bucket [aykdmh-backups]: " bucket; bucket="${bucket:-aykdmh-backups}"
[[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo "NOT READY: not a bucket name; nothing changed"; exit 1; }
saved_endpoint="$(sed -n 's/^RCLONE_CONFIG_R2_ENDPOINT=//p' /etc/aykdmh/r2.env 2>/dev/null | head -1 || true)"
read -r -p "S3 API endpoint${saved_endpoint:+ [$saved_endpoint]}: " endpoint; endpoint="${endpoint:-$saved_endpoint}"
endpoint="$(tr -d '[:space:]' <<< "$endpoint")"; endpoint="${endpoint%/}"; endpoint="${endpoint%/$bucket}"
[[ "$endpoint" =~ ^https://[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com$ ]] || { echo "NOT READY: that does not look like an R2 S3 API address; nothing changed"; exit 1; }
read -r -p "Access Key ID (of the READ-ONLY key): " keyid; keyid="$(tr -d '[:space:]' <<< "$keyid")"
[[ "$keyid" =~ ^[a-f0-9]{32}$ ]] || { echo "NOT READY: the Access Key ID is 32 letters and digits (it had ${#keyid}); nothing changed"; exit 1; }
read -rs -p "Secret Access Key (not shown): " secret; echo
secret="$(tr -d '[:space:]' <<< "$secret")"
if [[ ${#secret} -eq 128 && "${secret:0:64}" == "${secret:64}" ]]; then secret="${secret:0:64}"; echo "(the secret was pasted twice; one copy kept)"; fi
[[ "$secret" =~ ^[a-f0-9]{64}$ ]] || { echo "NOT READY: the Secret Access Key is 64 letters and digits (it had ${#secret}); nothing changed"; exit 1; }

if [[ -z "${SKIP_R2_CHECK:-}" ]]; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  umask 077
  printf 'RCLONE_CONFIG_R2_TYPE=s3\nRCLONE_CONFIG_R2_PROVIDER=Cloudflare\nRCLONE_CONFIG_R2_ENDPOINT=%s\nRCLONE_CONFIG_R2_ACCESS_KEY_ID=%s\nRCLONE_CONFIG_R2_SECRET_ACCESS_KEY=%s\nRCLONE_CONFIG_R2_NO_CHECK_BUCKET=true\n' \
    "$endpoint" "$keyid" "$secret" > "$T/r2.env"
  if docker run --rm --network host --env-file "$T/r2.env" rclone/rclone:1.68.2 --bind 0.0.0.0 -q lsf "r2:$bucket/daily/" > "$T/list"; then
    echo "OK   the key can read $bucket ($(grep -c . "$T/list" || true) backups listed)"
  else
    echo "NOT READY: R2 refused the key (check: Object Read only, bucket $bucket, this server's address). Nothing changed."; exit 1
  fi
fi

copy="${BACKUP_DIR:-/root/backups}/env-before-backups-report-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$(dirname "$copy")"; install -m 600 "$ENV_FILE" "$copy"
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
grep -vE '^R2_BACKUPS_(ENDPOINT|BUCKET|READ_KEY_ID|READ_SECRET)=' "$ENV_FILE" > "$tmp" || true
printf 'R2_BACKUPS_ENDPOINT=%s\nR2_BACKUPS_BUCKET=%s\nR2_BACKUPS_READ_KEY_ID=%s\nR2_BACKUPS_READ_SECRET=%s\n' "$endpoint" "$bucket" "$keyid" "$secret" >> "$tmp"
chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"
unset secret
echo "saved in $ENV_FILE (previous copy: $copy)"
echo "DONE. The admin backups report shows it from the next release: bash deploy/release-app.sh"
