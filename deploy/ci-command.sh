#!/usr/bin/env bash
# What the GitHub deploy key may do on the server (AYK-305), and nothing else. The key's line in
# /root/.ssh/authorized_keys forces this script (command="…",restrict: no shell, no forwarding),
# whatever the connection asks for. The request is in SSH_ORIGINAL_COMMAND:
#   status            the live version (/var/www/aykdmh/current/version.json)
#   deploy <commit>   pull, check the server is exactly at that commit (the one GitHub tested),
#                     then deploy/release-app.sh. A newer or older commit is refused, never guessed.
# One deploy at a time. Everything is logged to /var/log/aykdmh-ci.log.
set -euo pipefail
REPO_DIR=/opt/aykdmh
LOG=/var/log/aykdmh-ci.log
request="${SSH_ORIGINAL_COMMAND:-}"

case "$request" in
  status)
    cat /var/www/aykdmh/current/version.json; echo; exit 0 ;;
  deploy\ *)
    commit="${request#deploy }"
    [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: 'deploy' needs a full 40-character commit id"; exit 2; } ;;
  *)
    echo "refused: this key may only run 'status' or 'deploy <commit>'"; exit 2 ;;
esac

exec 8> /run/aykdmh-ci.lock
flock -n 8 || { echo "another deploy is running; try again when it ends"; exit 3; }

set +e
{
  set -e
  echo "== $(date -u +%FT%TZ) deploy $commit (from GitHub)"
  cd "$REPO_DIR"
  git pull --ff-only -q
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$commit" ]]; then
    echo "not deploying: the server's branch is at $head, GitHub asked for $commit"
    exit 4
  fi
  bash deploy/release-app.sh
} 2>&1 | tee -a "$LOG"
status="${PIPESTATUS[0]}"
echo "== $(date -u +%FT%TZ) exit $status" >> "$LOG"
exit "$status"
