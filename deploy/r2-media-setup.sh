#!/usr/bin/env bash
# Puts the R2 media key (AYK-248) into /opt/aykdmh/.env without ever showing it, then proves it works
# by writing and deleting one small test file in the bucket. Run as root, after creating in Cloudflare
# the bucket aykdmh-media, its key (Object Read & Write, that bucket only, NO client IP filter) and
# its CORS policy (docs/MEDIA_R2.md):
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/r2-media-setup.sh
# The application uses the key from its next release (deploy/release-app.sh). A copy of the previous
# .env is kept in /root/backups (mode 600). Nothing on the site changes before that release.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/aykdmh/.env}"
[[ $EUID -eq 0 || -n "${ENV_FILE_TEST:-}" ]] || { echo "Run as root."; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "NOT READY: $ENV_FILE not found; nothing changed"; exit 1; }

read -r -p "Bucket [aykdmh-media]: " bucket; bucket="${bucket:-aykdmh-media}"
[[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo "NOT READY: not a bucket name; nothing changed"; exit 1; }
read -r -p "S3 API endpoint (https://<account id>.r2.cloudflarestorage.com): " endpoint
endpoint="$(tr -d '[:space:]' <<< "$endpoint")"; endpoint="${endpoint%/}"; endpoint="${endpoint%/$bucket}"
[[ "$endpoint" =~ ^https://[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com$ ]] || { echo "NOT READY: that does not look like an R2 S3 API address; nothing changed"; exit 1; }
read -r -p "Access Key ID: " keyid; keyid="$(tr -d '[:space:]' <<< "$keyid")"
[[ "$keyid" =~ ^[a-f0-9]{32}$ ]] || { echo "NOT READY: the Access Key ID is 32 letters and digits (it had ${#keyid}); nothing changed"; exit 1; }
read -rs -p "Secret Access Key (not shown): " secret; echo
secret="$(tr -d '[:space:]' <<< "$secret")"
if [[ ${#secret} -eq 128 && "${secret:0:64}" == "${secret:64}" ]]; then secret="${secret:0:64}"; echo "(the secret was pasted twice; one copy kept)"; fi
[[ "$secret" =~ ^[a-f0-9]{64}$ ]] || { echo "NOT READY: the Secret Access Key is 64 letters and digits (it had ${#secret}); nothing changed"; exit 1; }

# Prove the key before saving it: write one small file, read it back, delete it.
if [[ -z "${SKIP_R2_CHECK:-}" ]]; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  umask 077
  printf 'RCLONE_CONFIG_R2_TYPE=s3\nRCLONE_CONFIG_R2_PROVIDER=Cloudflare\nRCLONE_CONFIG_R2_ENDPOINT=%s\nRCLONE_CONFIG_R2_ACCESS_KEY_ID=%s\nRCLONE_CONFIG_R2_SECRET_ACCESS_KEY=%s\nRCLONE_CONFIG_R2_NO_CHECK_BUCKET=true\n' \
    "$endpoint" "$keyid" "$secret" > "$T/r2.env"
  echo "media key check $(date -u +%FT%TZ)" > "$T/check.txt"
  rc() { docker run --rm --network host --env-file "$T/r2.env" -v "$T":/data rclone/rclone:1.68.2 --bind 0.0.0.0 -q "$@"; }
  name="healthcheck/setup-$(date +%Y%m%d%H%M%S).txt"
  if rc copyto /data/check.txt "r2:$bucket/$name" && rc cat "r2:$bucket/$name" > /dev/null && rc deletefile "r2:$bucket/$name"; then
    echo "OK   the key can write, read and delete in $bucket"
  else
    echo "NOT READY: R2 refused the key (check: Object Read & Write, bucket $bucket, no IP filter). Nothing changed."; exit 1
  fi
fi

mkdir -p /root/backups 2>/dev/null || true
copy="${BACKUP_DIR:-/root/backups}/env-before-media-$(date +%Y%m%d-%H%M%S)"
install -m 600 "$ENV_FILE" "$copy"
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
grep -vE '^R2_MEDIA_(ENDPOINT|BUCKET|ACCESS_KEY_ID|SECRET_ACCESS_KEY)=' "$ENV_FILE" > "$tmp" || true
printf 'R2_MEDIA_ENDPOINT=%s\nR2_MEDIA_BUCKET=%s\nR2_MEDIA_ACCESS_KEY_ID=%s\nR2_MEDIA_SECRET_ACCESS_KEY=%s\n' "$endpoint" "$bucket" "$keyid" "$secret" >> "$tmp"
chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"
unset secret
echo "saved in $ENV_FILE (previous copy: $copy)"
echo "DONE. The app starts using it at the next release: bash deploy/release-app.sh"
