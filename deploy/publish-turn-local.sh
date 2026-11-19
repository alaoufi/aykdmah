#!/usr/bin/env bash
# Publish LiveKit's TURN-over-TLS port on 127.0.0.1:5349 so the server gateway (a separate
# project) can reach it (AYK-241). Recreates only the LiveKit container: a call in progress
# drops and can be redialled. Run as root:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/publish-turn-local.sh
set -euo pipefail
cd /opt/aykdmh
docker compose -p aykdmh --env-file /opt/aykdmh/.env -f deploy/docker-compose.yml up -d --no-deps livekit
for _ in $(seq 1 20); do
  if timeout 2 bash -c '</dev/tcp/127.0.0.1/5349' 2>/dev/null; then echo "OK: LiveKit TURN on 127.0.0.1:5349"; exit 0; fi
  sleep 2
done
echo "FAIL: 127.0.0.1:5349 not listening"; docker logs --tail 20 aykdmh-livekit; exit 1
