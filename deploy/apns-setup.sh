#!/usr/bin/env bash
# iPhone notifications while the app is closed (AYK-138/269): puts the APNs key into /opt/aykdmh/.env
# without ever showing it, after Apple has confirmed it is accepted. Run as root.
# 1. developer.apple.com -> Certificates, IDs & Profiles -> Keys -> "+" -> Apple Push Notifications
#    service (APNs) -> Continue -> Register -> Download (a file AuthKey_<KEY ID>.p8, downloadable once).
# 2. Copy it to the server, from PowerShell on your computer (one line):
#    scp "$([Environment]::GetFolderPath('UserProfile'))\Downloads\AuthKey_XXXXXXXXXX.p8" root@84.247.166.216:/root/
# 3. ssh -t root@84.247.166.216 "cd /opt/aykdmh && git pull --ff-only && bash deploy/apns-setup.sh"
# It asks for the Team ID (Membership details); the Key ID is read from the file name. The .p8 copy
# in /root is deleted after it has been saved (keep the original somewhere safe yourself).
# The app sends with it from its next release: bash deploy/release-app.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
[[ $EUID -eq 0 || -n "${ENV_FILE_TEST:-}" ]] || { echo "Run as root."; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "NOT READY: $ENV_FILE not found; nothing changed"; exit 1; }

shopt -s nullglob
files=(${P8_DIR:-/root}/AuthKey_*.p8)
[[ ${#files[@]} -eq 1 ]] || { echo "NOT READY: expected exactly one AuthKey_<KEY ID>.p8 in ${P8_DIR:-/root} (found ${#files[@]}); see step 2 at the top"; exit 1; }
p8="${files[0]}"
keyid="$(basename "$p8" .p8)"; keyid="${keyid#AuthKey_}"
[[ "$keyid" =~ ^[A-Z0-9]{10}$ ]] || { echo "NOT READY: the file name should be AuthKey_<10-character KEY ID>.p8"; exit 1; }
grep -q 'BEGIN PRIVATE KEY' "$p8" || { echo "NOT READY: $p8 is not a .p8 key file"; exit 1; }
openssl pkey -in "$p8" -noout -text 2>/dev/null | grep -qE 'prime256v1|P-256' || { echo "NOT READY: $p8 is not an Apple (P-256) key"; exit 1; }
read -r -p "Team ID (10 characters, developer.apple.com -> Membership details): " team
team="$(tr -d '[:space:]' <<< "$team" | tr '[:lower:]' '[:upper:]')"
[[ "$team" =~ ^[A-Z0-9]{10}$ ]] || { echo "NOT READY: the Team ID is 10 letters and digits; nothing changed"; exit 1; }
bundle="$(sed -n 's/^APNS_BUNDLE_ID=//p' "$ENV_FILE" | tail -1)"; bundle="${bundle:-sa.aykdmh.app}"
escaped="$(awk 'BEGIN{ORS="\\n"} {sub(/\r$/,""); print}' "$p8")"

if [[ -z "${SKIP_APPLE_CHECK:-}" ]]; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  umask 077
  printf 'APNS_KEY_ID=%s\nAPNS_TEAM_ID=%s\nAPNS_BUNDLE_ID=%s\nAPNS_KEY=%s\n' "$keyid" "$team" "$bundle" "$escaped" > "$T/apns.env"
  docker run --rm --network host --env-file "$T/apns.env" -v "$REPO_DIR/deploy/apns-check.cjs":/check.cjs:ro node:22-bookworm-slim node /check.cjs \
    || { echo "Nothing changed."; exit 1; }
fi

copy="${BACKUP_DIR:-/root/backups}/env-before-apns-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$(dirname "$copy")"; install -m 600 "$ENV_FILE" "$copy"
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
grep -vE '^APNS_(KEY_ID|TEAM_ID|KEY)=' "$ENV_FILE" > "$tmp" || true
printf 'APNS_KEY_ID=%s\nAPNS_TEAM_ID=%s\nAPNS_KEY=%s\n' "$keyid" "$team" "$escaped" >> "$tmp"
chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"
unset escaped
shred -u "$p8" 2>/dev/null || rm -f "$p8"
echo "saved in $ENV_FILE (previous copy: $copy); the .p8 copy on the server was deleted"
echo "DONE. iPhones are notified from the next release: bash deploy/release-app.sh"
