#!/usr/bin/env bash
# What the GitHub deploy key may do on the server (AYK-305), and nothing else. The key's line in
# /root/.ssh/authorized_keys forces this script (command="…",restrict: no shell, no forwarding),
# whatever the connection asks for. The request is in SSH_ORIGINAL_COMMAND:
#   status            the live version (/var/www/aykdmh/current/version.json)
#   deploy <commit>   fetch, move the branch forward to exactly that commit (the one GitHub tested),
#                     then deploy/release-app.sh. A commit older than the server's is refused.
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
  # Move forward to exactly the tested commit, not to whatever was pushed after it (AYK-305: a
  # push during the checks made the server newer than the tested commit and stopped the deploy).
  git fetch -q origin
  git cat-file -e "$commit^{commit}" 2>/dev/null || { echo "not deploying: $commit is not on GitHub's branch"; exit 4; }
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git merge-base --is-ancestor "$commit" "origin/$branch" || { echo "not deploying: $commit is not on $branch"; exit 4; }
  if git merge-base --is-ancestor HEAD "$commit"; then
    git merge --ff-only -q "$commit"
  fi
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$commit" ]]; then
    echo "not deploying: the server is already at a newer commit ($head) than the one GitHub asked for ($commit)"
    exit 4
  fi
  bash deploy/release-app.sh
} 2>&1 | tee -a "$LOG"
status="${PIPESTATUS[0]}"
echo "== $(date -u +%FT%TZ) exit $status" >> "$LOG"
exit "$status"
