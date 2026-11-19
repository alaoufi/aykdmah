#!/usr/bin/env bash
# Clean-up after the Contabo incident and the R2 setup (owner approved 2026-11-17). Run as root:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/cleanup-after-incident.sh
# 1. Deletes the two replaced backup encryption keys (they appeared in a chat; no backup uses them).
# 2. Deletes the sshd leftover of the removed freellm-lab account, after sshd accepts the result.
# 3. Shows when the nightly backup runs next (read only).
set -uo pipefail

echo "== 1. Replaced encryption keys =="
cur=/etc/aykdmh/backup-encryption.key
[[ -s "$cur" ]] || { echo "   the current key is missing: stopping, nothing deleted"; exit 1; }
found=0
for f in /etc/aykdmh/backup-encryption.key.replaced-*; do
  [[ -f "$f" ]] || continue
  cmp -s "$f" "$cur" && { echo "   $f is the current key: kept"; continue; }
  shred -u "$f" 2>/dev/null || rm -f "$f"; echo "   deleted $(basename "$f")"; found=1
done
[[ $found == 1 ]] || echo "   none left"

echo; echo "== 2. sshd leftover of freellm-lab =="
f=/etc/ssh/sshd_config.d/zz-freellmapi-lab.conf
if id freellm-lab >/dev/null 2>&1; then
  echo "   the account freellm-lab exists again: file kept, check by hand"
elif [[ -f "$f" ]]; then
  mv "$f" /root/zz-freellmapi-lab.conf.removed
  if sshd -t; then
    systemctl reload ssh && echo "   deleted (sshd configuration valid, ssh reloaded)"
    rm -f /root/zz-freellmapi-lab.conf.removed
  else
    mv /root/zz-freellmapi-lab.conf.removed "$f"; echo "   sshd rejected the result: file put back, nothing changed"
  fi
else
  echo "   already gone"
fi
echo "   login rules now: $(sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication) ' | paste -sd',' -)"

echo; echo "== 3. Nightly backup =="
systemctl list-timers aykdmh-backup.timer --no-pager 2>/dev/null | sed -n '1,2p' | sed 's/^/   /'
echo "   last run: $(systemctl show aykdmh-backup.service -p ExecMainExitTimestamp --value 2>/dev/null) (exit $(systemctl show aykdmh-backup.service -p ExecMainStatus --value 2>/dev/null))"
echo; echo "== done =="
