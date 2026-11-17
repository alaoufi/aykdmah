#!/usr/bin/env bash
# Why does R2 refuse the aykdmh-backups key? READ ONLY, prints no secret (only lengths and R2's own
# error code). Run as root:  bash /opt/aykdmh/deploy/r2-diagnose.sh
set -uo pipefail
ENV=/etc/aykdmh/r2.env
[[ -s "$ENV" ]] || { echo "no $ENV: run deploy/r2-setup.sh first"; exit 1; }
val() { sed -n "s/^$1=//p" "$ENV"; }
EP="$(val RCLONE_CONFIG_R2_ENDPOINT)"; ID="$(val RCLONE_CONFIG_R2_ACCESS_KEY_ID)"
SECRET="$(val RCLONE_CONFIG_R2_SECRET_ACCESS_KEY)"; BUCKET="$(val R2_BUCKET)"
echo "== 1. Saved values (no secrets) =="
echo "   endpoint: $EP"
echo "   bucket: $BUCKET"
echo "   access key id: ${#ID} characters (expected 32), starts ${ID:0:4}"
echo "   secret: ${#SECRET} characters (expected 64)"
[[ "$SECRET" =~ [[:space:]] ]] && echo "   CHECK: the secret contains a space or line break"
echo; echo "== 2. This server's addresses as the internet sees them =="
echo "   IPv4: $(curl -4 -s --max-time 8 https://ifconfig.me || echo none)"
echo "   IPv6: $(curl -6 -s --max-time 8 https://ifconfig.me || echo none)"
echo "   clock (UTC): $(date -u '+%Y-%m-%d %H:%M:%S')  (signatures fail if it is off by minutes)"
echo; echo "== 3. R2's answer to listing the bucket =="
for v in 4 6; do
  out=$(curl -$v -s --max-time 15 -w '\nHTTP %{http_code}' --aws-sigv4 "aws:amz:auto:s3" \
        --user "$ID:$SECRET" "$EP/$BUCKET?list-type=2&max-keys=1" 2>&1)
  code=$(echo "$out" | tail -1)
  why=$(echo "$out" | grep -oE '<Code>[^<]*</Code>|<Message>[^<]*</Message>' | sed -E 's/<[^>]+>//g' | paste -sd' ' -)
  echo "   over IPv$v: $code ${why:-}"
done
echo; echo "== done (nothing was changed) =="
