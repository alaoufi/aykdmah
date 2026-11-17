#!/usr/bin/env bash
# Off-server backups of aykdmh.com to Cloudflare R2 (AYK-247): one-time setup. Run as root:
#   ssh -t root@84.247.166.216 "cd /opt/aykdmh && git pull --ff-only && bash deploy/r2-setup.sh"
# 1. Asks for the R2 API token of the aykdmh-backups bucket (typed or pasted here, never in a
#    chat or in Git) and saves it in /etc/aykdmh/r2.env (root only).
# 2. Creates the backup encryption key /etc/aykdmh/backup-encryption.key (once) and shows it ONE
#    time: the owner keeps it in a password manager. A backup cannot be restored without it.
# 3. Tests the connection: uploads, lists and deletes a small test file.
set -euo pipefail
umask 077
DIR=/etc/aykdmh
ENV="$DIR/r2.env"
KEY="$DIR/backup-encryption.key"
BUCKET=aykdmh-backups
RCLONE_IMAGE=rclone/rclone:1.68.2
mkdir -p "$DIR"

echo "== 1. R2 key for the bucket $BUCKET =="
echo "Paste each value from the Cloudflare page, then press Enter (the secret is not shown)."
read -r -p "S3 API endpoint (https://<account id>.r2.cloudflarestorage.com): " endpoint
read -r -p "Access Key ID: " key_id
read -r -s -p "Secret Access Key: " secret; echo
endpoint="${endpoint%/}"; endpoint="${endpoint%/$BUCKET}"
[[ "$endpoint" =~ ^https://[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com$ ]] || { echo "endpoint does not look like an R2 S3 API address: nothing saved"; exit 1; }
[[ -n "$key_id" && -n "$secret" ]] || { echo "empty key: nothing saved"; exit 1; }
cat > "$ENV" <<EOF
RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ENDPOINT=$endpoint
RCLONE_CONFIG_R2_ACCESS_KEY_ID=$key_id
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$secret
RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
R2_BUCKET=$BUCKET
EOF
chmod 600 "$ENV"
echo "saved $ENV (root only)"

echo; echo "== 2. Encryption key =="
if [[ -s "$KEY" ]]; then
  echo "already exists ($KEY): kept as it is"
else
  openssl rand -base64 48 > "$KEY"; chmod 600 "$KEY"
  echo "NEW backup encryption key. Copy it now into your password manager (it is shown only once):"
  echo; echo "    $(cat "$KEY")"; echo
  echo "Without this key no off-server backup can be restored. Do not send it in a chat."
fi

echo; echo "== 3. Connection test =="
test_name="connection-test-$(date +%Y%m%d-%H%M%S).txt"
echo "aykdmh R2 connection test" > "/tmp/$test_name"
rc() { docker run --rm --network host --env-file "$ENV" -v /tmp:/data "$RCLONE_IMAGE" "$@"; }
rc copyto "/data/$test_name" "r2:$BUCKET/test/$test_name" && echo "OK    upload"
rc ls "r2:$BUCKET/test/" | grep -q "$test_name" && echo "OK    list"
rc deletefile "r2:$BUCKET/test/$test_name" && echo "OK    delete"
rm -f "/tmp/$test_name"
echo; echo "DONE: R2 is ready. Next: the daily backup also sends an encrypted copy (deploy/backup.sh)."
