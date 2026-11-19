#!/usr/bin/env bash
# Run the simulator (AYK-250) on the server behind a password. Run as root:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/install-simulator.sh
# What it does: asks for a password of your choice (typed here, saved in /etc/aykdmh/sim.env with
# mode 600, never printed, never in Git), builds the image, starts the containers aykdmh-sim and
# aykdmh-sim-db, and checks that the page refuses a visitor without the password.
# What it never touches: the live site's containers, database, files, the gateway, DNS.
# The page listens on 127.0.0.1:8103 only; it opens to the outside when the gateway routes
# sim.aykdmh.com to it (alaoufi/server-edge, sites/sim.aykdmh.com.caddy) and DNS has the record.
#   --new-password   choose a new password        --stop / --start   pause or resume the containers
# Remove everything:  bash deploy/remove-simulator.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/aykdmh/sim.env
PORT=8103
COMPOSE=(docker compose -p aykdmh-sim --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/sim.compose.yml")

[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
case "${1:-}" in
  --stop)  "${COMPOSE[@]}" stop; echo "DONE: the simulator is paused (bash deploy/install-simulator.sh --start resumes it)"; exit 0 ;;
  --start) "${COMPOSE[@]}" start; echo "DONE: the simulator is running"; exit 0 ;;
  ""|--new-password) ;;
  *) echo "unknown option: $1"; exit 1 ;;
esac

# The port must be free, or already ours.
owner="$(docker ps --filter "publish=$PORT" --format '{{.Names}}' | head -1)"
if [[ -n "$owner" && "$owner" != aykdmh-sim-db ]]; then echo "NOT READY: port $PORT is used by container $owner"; exit 1; fi
if [[ -z "$owner" ]] && (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "NOT READY: port $PORT is already in use on this server"; exit 1; fi

saved() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1='\(.*\)'$/\1/p" "$ENV_FILE" | head -1 || true; }
PASSWORD="$(saved SIM_PASSWORD)"
PG_PASSWORD="$(saved SIM_PG_PASSWORD)"
if [[ -z "$PASSWORD" || "${1:-}" == --new-password ]]; then
  echo "Choose the simulator password: 8 characters or more, letters and digits (nothing is shown while you type)."
  for attempt in 1 2 3; do
    read -rs -p "Password: " PASSWORD; echo
    read -rs -p "Again:    " AGAIN; echo
    if [[ "$PASSWORD" != "$AGAIN" ]]; then echo "The two entries differ."; PASSWORD=""; continue; fi
    if [[ ${#PASSWORD} -lt 8 ]]; then echo "Too short: 8 characters or more."; PASSWORD=""; continue; fi
    if [[ ! "$PASSWORD" =~ ^[A-Za-z0-9._@%+=!-]+$ ]]; then echo "Use English letters, digits and . _ @ % + = ! - only."; PASSWORD=""; continue; fi
    break
  done
  [[ -n "$PASSWORD" ]] || { echo "NOT READY: no password was set; nothing was changed"; exit 1; }
fi
[[ -n "$PG_PASSWORD" ]] || PG_PASSWORD="$(openssl rand -hex 24)"

# Ceilings from this server's size: the simulator gets at most a third of the cores (1 to 3).
CORES="$(nproc)"
SIM_CPUS=$(( CORES / 3 )); (( SIM_CPUS < 1 )) && SIM_CPUS=1; (( SIM_CPUS > 3 )) && SIM_CPUS=3
SIM_DB_CPUS=$(( CORES / 4 )); (( SIM_DB_CPUS < 1 )) && SIM_DB_CPUS=1; (( SIM_DB_CPUS > 2 )) && SIM_DB_CPUS=2

install -d -m 700 /etc/aykdmh
umask 077
cat > "$ENV_FILE.new" <<ENV
# The simulator's settings (deploy/install-simulator.sh). Secrets: never copy into Git or a chat.
SIM_PASSWORD='$PASSWORD'
SIM_PG_PASSWORD='$PG_PASSWORD'
SIM_CPUS=$SIM_CPUS
SIM_DB_CPUS=$SIM_DB_CPUS
SIM_MAX_WORKERS=$SIM_CPUS
SIM_MAX_PEOPLE=300
SIM_MAX_BULK=40000
SIM_MAX_RUSH=5000
ENV
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
unset PASSWORD AGAIN

echo "== Building and starting (cores for the simulator: $SIM_CPUS, for its database: $SIM_DB_CPUS) =="
[[ "${SIM_NO_BUILD:-}" == 1 ]] || "${COMPOSE[@]}" build sim
"${COMPOSE[@]}" up -d --no-build --force-recreate

ok=0
for _ in $(seq 1 30); do
  sleep 2
  without="$(curl -s --noproxy 127.0.0.1 -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/" || true)"
  # The right password is tried from inside the container, so it never appears in a command line.
  if [[ "$without" == 401 ]] && docker exec aykdmh-sim node -e "fetch('http://127.0.0.1:4600/limits',{headers:{authorization:'Basic '+Buffer.from('sim:'+process.env.SIM_PASSWORD).toString('base64')}}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then ok=1; break; fi
done
if [[ "$ok" != 1 ]]; then
  echo "NOT READY: the page did not answer as expected (without password: ${without:-none}). Last lines:"
  docker logs --tail 15 aykdmh-sim 2>&1 || true
  exit 1
fi
echo "OK   the page answers on 127.0.0.1:$PORT: refused without the password, opens with it"

outside="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://sim.aykdmh.com/ || true)"
if [[ "$outside" == 401 ]]; then
  echo "DONE: open https://sim.aykdmh.com  (any user name, and your password)"
else
  echo "DONE on the server. Not reachable from outside yet (https://sim.aykdmh.com answered: ${outside:-nothing})."
  echo "Remaining, each needs the owner's approval: the DNS record sim.aykdmh.com -> this server, and the gateway file sites/sim.aykdmh.com.caddy."
fi
