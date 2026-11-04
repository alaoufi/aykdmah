#!/bin/bash
# Consistent online snapshots of each private database. Never mounts production.
set -eu -o pipefail
umask 077
cd /opt/private-agent-console
image=$(docker inspect -f '{{.Config.Image}}' agent-console-web)
[[ "$image" =~ ^private-agent-console-web:[0-9a-f]{40}$ ]]
dest=$(mktemp -d "$PWD/backups/.web-XXXXXXXX")
chown 31071:31071 "$dest"
docker run --rm --network none --read-only --user 31071:31071 \
  --cap-drop ALL --security-opt no-new-privileges --memory 192m --cpus .5 --pids-limit 32 \
  -e AGENT_AUTH_DIR=/auth --mount "type=bind,src=$PWD/data,dst=/data" --mount "type=bind,src=$PWD/auth,dst=/auth" \
  --mount "type=bind,src=$dest,dst=/snapshot" "$image" node --no-warnings backup.cjs save /data /snapshot/db
chown -R root:root "$dest"
cp -- owner-password session-secret "$dest/"
printf '%s\n' "$image" > "$dest/version"
(cd "$dest" && sha256sum -- db/queue.sqlite db/web/auth.sqlite db/snapshot-v1.json owner-password session-secret version > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null)
mv -T -- "$dest" "$PWD/backups/web-$(date -u +%Y%m%dT%H%M%SZ)-${dest##*-}"
