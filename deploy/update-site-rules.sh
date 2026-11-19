#!/usr/bin/env bash
# Apply deploy/caddy/aykdmh-site.Caddyfile (CSP and site rules) to the live Coolify frontend (AYK-240).
# Run as root on the server:  cd /opt/aykdmh && git pull --ff-only && bash deploy/update-site-rules.sh
# Steps: back up the runtime copy, validate the new file with the frontend's own Caddy image, replace
# the copy in place, then reload it, or restart the frontend (a second or two) when it cannot reload,
# then check the site and the CSP. On a failed check, the backup is put back.
# The site rules keep `admin off` (no admin endpoint in the frontend), so in practice this restarts:
# tested on the server on 2026-11-19 (AYK-301). Site rules change rarely; app deploys do not use this.
set -euo pipefail
NEW=/opt/aykdmh/deploy/caddy/aykdmh-site.Caddyfile
LIVE=/etc/aykdmh/coolify-site/Caddyfile
BACKUP="$LIVE.bak-$(date +%Y%m%d-%H%M%S)"

C="$(docker ps --format '{{.ID}} {{.Mounts}}' | awk -v live="$LIVE" 'index($0, live) {print $1; exit}')"
[[ -z "$C" ]] && C="$(docker ps -q --filter "volume=$LIVE" | head -1)"
if [[ -z "$C" ]]; then
  for id in $(docker ps -q); do
    if docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$id" | grep -qF "$LIVE"; then C="$id"; break; fi
  done
fi
[[ -n "$C" ]] || { echo "frontend container not found (no container mounts $LIVE)"; exit 1; }
IMAGE="$(docker inspect -f '{{.Image}}' "$C")"
echo "frontend container: $(docker inspect -f '{{.Name}}' "$C")"

if cmp -s "$NEW" "$LIVE"; then echo "site rules already up to date"; exit 0; fi
diff -u "$LIVE" "$NEW" || true

docker run --rm --network none -v "$NEW:/etc/site/Caddyfile:ro" --entrypoint /usr/bin/caddy "$IMAGE" \
  validate --config /etc/site/Caddyfile --adapter caddyfile
cp -p "$LIVE" "$BACKUP"
# Written in place (same file), so the container's mount sees it and a reload is enough.
cat "$NEW" > "$LIVE"
DEST="$(docker inspect -f '{{range .Mounts}}{{if eq .Source "'"$LIVE"'"}}{{.Destination}}{{end}}{{end}}' "$C")"
reload() {
  if [[ -n "$DEST" ]] && docker exec "$C" caddy reload --config "$DEST" --adapter caddyfile > /dev/null 2>&1; then echo "reloaded without restart"
  else echo "reload not possible: restarting the frontend"; docker restart "$C" > /dev/null; fi
}
reload

ok=0
for _ in $(seq 1 30); do
  sleep 2
  root=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://aykdmh.com/ || true)
  api=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://aykdmh.com/api/health || true)
  [[ "$root" == 200 && "$api" == 200 ]] && { ok=1; break; }
done
csp="$(curl -s -o /dev/null -D - --max-time 10 https://aykdmh.com/ | grep -i '^content-security-policy' || true)"
if [[ "$ok" == 1 ]] && grep -q "script-src 'self';" <<< "$csp" && ! grep -qE 'unsafe-eval|huggingface' <<< "$csp"; then
  echo "OK: site $root, api $api, new CSP live. Backup of the previous rules: $BACKUP"
else
  echo "check FAILED (site $root, api $api): restoring the previous rules"
  cat "$BACKUP" > "$LIVE"; reload
  exit 1
fi
