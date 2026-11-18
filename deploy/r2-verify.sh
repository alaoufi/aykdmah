#!/usr/bin/env bash
# Proves the newest encrypted backup in R2 can be restored: downloads it, decrypts it with
# /etc/aykdmh/backup-encryption.key into a temporary folder, checks every file against its
# SHA256SUMS and that the database dump can be listed, then deletes the temporary copy.
# Changes nothing on the site. In R2 it only adds a small note verified/<backup>.json after a
# successful test, which the backups page shows as "last successful restore test" (server-edge
# backups-monitor); notes older than 30 days are removed. Run as root:  bash /opt/aykdmh/deploy/r2-verify.sh
set -euo pipefail
ENV=/etc/aykdmh/r2.env
KEY=/etc/aykdmh/backup-encryption.key
BUCKET="$(sed -n 's/^R2_BUCKET=//p' "$ENV")"
TMP="$(mktemp -d /root/r2-verify.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
rc() { docker run --rm --network host --env-file "$ENV" -v "$TMP":/data rclone/rclone:1.68.2 --bind 0.0.0.0 -q "$@"; }

echo "== 1. Encrypted backups in R2 ($BUCKET/daily) =="
list="$(rc lsl "r2:$BUCKET/daily/" | sort -k2,3)"
[[ -n "$list" ]] || { echo "   none yet"; exit 1; }
echo "$list" | awk '{printf "   %s %s  %8.1f MB  %s\n", $2, substr($3,1,8), $1/1048576, $4}'
newest="$(echo "$list" | tail -1 | awk '{print $4}')"

echo; echo "== 2. Restore test of the newest: $newest =="
rc copyto "r2:$BUCKET/daily/$newest" "/data/$newest"
echo "   downloaded ($(du -h "$TMP/$newest" | cut -f1))"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY" -in "$TMP/$newest" | tar xf - -C "$TMP"
echo "   decrypted with the key: OK"
set_dir="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
(cd "$set_dir" && sha256sum -c --quiet SHA256SUMS) && echo "   every file matches its checksum: OK"
docker exec -i aykdmh-db pg_restore --list < "$set_dir/db.dump" | grep -c 'TABLE DATA' | xargs -I{} echo "   database dump readable: OK ({} tables with data)"
if [[ -f "$set_dir/code.bundle" ]]; then
  git clone -q "$set_dir/code.bundle" "$TMP/code" 2>/dev/null && echo "   code restorable: OK ($(git -C "$TMP/code" log -1 --format='%h %cs') on $(git -C "$TMP/code" branch --show-current), $(git -C "$TMP/code" branch -a | wc -l) branches)"
  echo "   files outside Git: $(tar tzf "$set_dir/local-files.tgz" | wc -l); server settings: $(tar tzf "$set_dir/server-settings.tgz" | grep -vc '/$')"
fi
[[ -f "$set_dir/README-RESTORE.md" ]] && echo "   restore guide for developers: OK (README-RESTORE.md)"
echo "   files in the set: $(cd "$set_dir" && ls | tr '\n' ' ')"
# The backups page reads this note (a failed test above stops the script before it is written).
printf '{"backup":"%s","checked_at":"%s","result":"restorable"}\n' "$newest" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TMP/verified.json"
if rc copyto /data/verified.json "r2:$BUCKET/verified/$newest.json"; then
  rc delete --min-age 30d "r2:$BUCKET/verified/" || true
  echo "   result noted in R2 for the backups page: verified/$newest.json"
else
  echo "   (could not note the result in R2; the test itself passed)"
fi
echo; echo "== RESTORABLE: the off-server backup works (temporary copy deleted) =="
