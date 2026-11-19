#!/usr/bin/env bash
# Lets GitHub Actions deploy aykdmh.com (AYK-305), one-time setup. Run as root on the server:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/ci-setup.sh
# 1. A deploy key for GitHub, kept in /etc/aykdmh/ci (root only; left out of backups).
# 2. Its line in /root/.ssh/authorized_keys, restricted: it can only run deploy/ci-command.sh
#    (status, or deploy one tested commit), with no shell, no forwarding, no other command.
#    Only this key's own line (marked aykdmh-github-deploy) is ever added or replaced.
# 3. Prints the server's public host key, for GitHub to check it talks to this server.
# The private key is never printed. The owner copies it with scp into the GitHub secret.
# Undo: delete the line ending in aykdmh-github-deploy from /root/.ssh/authorized_keys.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEY_DIR=/etc/aykdmh/ci
KEY="$KEY_DIR/github-deploy"
MARK=aykdmh-github-deploy
AUTH=/root/.ssh/authorized_keys

install -d -m 700 "$KEY_DIR" /root/.ssh
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N '' -C "$MARK" -f "$KEY"
chmod 600 "$KEY"
touch "$AUTH"; chmod 600 "$AUTH"
line="command=\"/usr/bin/bash $REPO_DIR/deploy/ci-command.sh\",restrict $(cat "$KEY.pub")"
# Replace only this key's line; every other key stays exactly as it is (same file, same order).
{ grep -v " $MARK\$" "$AUTH" || true; echo "$line"; } > "$AUTH.new"
cat "$AUTH.new" > "$AUTH"; rm -f "$AUTH.new"
grep -c " $MARK\$" "$AUTH" | grep -qx 1 || { echo "NOT READY: the key line was not written once"; exit 1; }

echo "OK: the GitHub deploy key is ready (it can only check the version or deploy a tested commit)."
echo
echo "Secret AYKDMH_HOST_KEY (public, safe to show):"
echo "84.247.166.216 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
