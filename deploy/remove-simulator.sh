#!/usr/bin/env bash
# Remove the simulator from the server completely. Run as root:  bash deploy/remove-simulator.sh
# Removes only: the containers aykdmh-sim and aykdmh-sim-db, their two volumes (throw-away databases
# and saved run results), the image aykdmh-sim, and /etc/aykdmh/sim.env. Nothing of the live site.
# The gateway file sites/sim.aykdmh.com.caddy and the DNS record are removed separately.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/aykdmh/sim.env
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
if [[ -f "$ENV_FILE" ]]; then
  docker compose -p aykdmh-sim --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/sim.compose.yml" down -v --remove-orphans
else
  for name in aykdmh-sim aykdmh-sim-db; do docker rm -f "$name" > /dev/null 2>&1 || true; done
  for volume in aykdmh-sim_simdata aykdmh-sim_simruns; do docker volume rm "$volume" > /dev/null 2>&1 || true; done
  docker network rm aykdmh-sim_default > /dev/null 2>&1 || true
fi
docker image rm aykdmh-sim:latest > /dev/null 2>&1 || true
rm -f "$ENV_FILE"
left="$(docker ps -a --format '{{.Names}}' | grep -E '^aykdmh-sim' || true)"
[[ -z "$left" ]] && echo "DONE: the simulator is removed" || { echo "still present: $left"; exit 1; }
