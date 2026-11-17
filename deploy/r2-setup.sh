#!/usr/bin/env bash
# Off-server backups of aykdmh.com to Cloudflare R2 (AYK-247): one-time setup. Run as root:
#   ssh -t root@84.247.166.216 "cd /opt/aykdmh && git pull --ff-only && bash deploy/r2-setup.sh"
# 1. Asks for the R2 API token of the aykdmh-backups bucket (typed or pasted here, never in a
#    chat or in Git) and saves it in /etc/aykdmh/r2.env (root only).
# 2. Creates the backup encryption key /etc/aykdmh/backup-encryption.key (once) and shows it ONE
#    time: the owner keeps it in a password manager. A backup cannot be restored without it.
# 3. Tests the connection: uploads, lists and deletes a small test file.
# Running it again keeps the saved R2 key and the encryption key. Options:
#   --reenter              type the three R2 values again (a new or wrong R2 key)
#   --new-encryption-key   replace the encryption key (only before backups exist, or if it leaked:
#                          backups made with the old key then need the old key to restore)
set -euo pipefail
REENTER=0; NEWKEY=0
for a in "$@"; do case "$a" in --reenter) REENTER=1;; --new-encryption-key) NEWKEY=1;; *) echo "unknown option $a"; exit 1;; esac; done
umask 077
DIR=/etc/aykdmh
ENV="$DIR/r2.env"
KEY="$DIR/backup-encryption.key"
BUCKET=aykdmh-backups
RCLONE_IMAGE=rclone/rclone:1.68.2
mkdir -p "$DIR"

echo "== 1. R2 key for the bucket $BUCKET =="
if [[ -s "$ENV" && $REENTER -eq 0 ]]; then
  echo "already saved ($ENV): kept as it is (run with --reenter to type it again)"
else
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
fi

echo; echo "== 2. Encryption key =="
if [[ $NEWKEY -eq 1 && -s "$KEY" ]]; then
  mv "$KEY" "$KEY.replaced-$(date +%Y%m%d-%H%M%S)"
  echo "old key moved aside (root only); a new one is created now"
fi
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
# --bind 0.0.0.0: always leave over IPv4, the address the R2 key's IP filter allows (84.247.166.216).
rc() { docker run --rm --network host --env-file "$ENV" -v /tmp:/data "$RCLONE_IMAGE" --bind 0.0.0.0 -q "$@"; }
fail=0
if rc copyto "/data/$test_name" "r2:$BUCKET/test/$test_name"; then echo "OK    upload"; else echo "FAIL  upload"; fail=1; fi
if rc ls "r2:$BUCKET/test/" | grep -q "$test_name"; then echo "OK    list"; else echo "FAIL  list"; fail=1; fi
if [[ $fail -eq 0 ]]; then
  if rc deletefile "r2:$BUCKET/test/$test_name"; then echo "OK    delete"; else echo "FAIL  delete"; fail=1; fi
fi
rm -f "/tmp/$test_name"
if [[ $fail -ne 0 ]]; then
  echo; echo "NOT READY: R2 refused the key (403 = wrong key, wrong bucket, or the IP filter does not allow 84.247.166.216)."
  exit 1
fi
echo; echo "DONE: R2 is ready. Next: the daily backup also sends an encrypted copy (deploy/backup.sh)."
