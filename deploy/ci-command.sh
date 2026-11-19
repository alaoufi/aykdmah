#!/usr/bin/env bash
# What the GitHub deploy key may do on the server (AYK-305), and nothing else. The key's line in
# /root/.ssh/authorized_keys forces this script (command="…",restrict: no shell, no forwarding),
# whatever the connection asks for. The request is in SSH_ORIGINAL_COMMAND:
#   status            the live version (/var/www/aykdmh/current/version.json)
#   android-build <commit>  moves to that tested commit (as deploy does) and builds the signed Android
#                     bundle with android/build.sh; the signing key never leaves the server. Prints
#                     "AAB <sha256> <bytes>" (AYK-309).
#   android-aab <sha256>  sends that bundle on standard output, only if its SHA-256 matches, so
#                     GitHub uploads exactly what was built (to Google Play, with its own key).
#   deploy <commit>   fetch, move the branch forward to exactly that commit (the one GitHub tested),
#                     then deploy/release-app.sh. A commit older than the server's is refused.
# One deploy at a time. Everything is logged to /var/log/aykdmh-ci.log.
set -euo pipefail
REPO_DIR=/opt/aykdmh
LOG=/var/log/aykdmh-ci.log
request="${SSH_ORIGINAL_COMMAND:-}"

AAB=/root/aykdmh-android/project/aykdmh.aab
case "$request" in
  status)
    cat /var/www/aykdmh/current/version.json; echo; exit 0 ;;
  android-aab\ *)
    want="${request#android-aab }"
    [[ "$want" =~ ^[0-9a-f]{64}$ ]] || { echo "refused: 'android-aab' needs the bundle's SHA-256" >&2; exit 2; }
    [[ -f "$AAB" ]] || { echo "no bundle built" >&2; exit 4; }
    [[ "$(sha256sum "$AAB" | cut -d' ' -f1)" == "$want" ]] || { echo "the bundle changed since it was built" >&2; exit 4; }
    exec cat "$AAB" ;;
  android-build\ *)
    commit="${request#android-build }"; action=android
    [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: 'android-build' needs a full 40-character commit id"; exit 2; } ;;
  deploy\ *)
    commit="${request#deploy }"; action=deploy
    [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: 'deploy' needs a full 40-character commit id"; exit 2; } ;;
  *)
    echo "refused: this key may only run 'status', 'deploy <commit>', 'android-build <commit>' or 'android-aab <sha256>'"; exit 2 ;;
esac

exec 8> /run/aykdmh-ci.lock
flock -n 8 || { echo "another deploy is running; try again when it ends"; exit 3; }

set +e
{
  set -e
  echo "== $(date -u +%FT%TZ) $action $commit (from GitHub)"
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
  if [[ "$action" == android ]]; then
    rm -f "$AAB"
    bash android/build.sh
    echo "AAB $(sha256sum "$AAB" | cut -d' ' -f1) $(stat -c %s "$AAB")"
  else
    bash deploy/release-app.sh
  fi
} 2>&1 | tee -a "$LOG"
status="${PIPESTATUS[0]}"
echo "== $(date -u +%FT%TZ) exit $status" >> "$LOG"
exit "$status"
