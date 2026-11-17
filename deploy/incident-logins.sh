#!/usr/bin/env bash
# Contabo incident follow-up (2026-11-14): were the sign-ins of 14-15 November the owner, and what was
# the deleted account freellm-lab? READ ONLY: changes nothing, prints no secrets. Run as root:
#   ssh -t root@84.247.166.216 "cd /opt/aykdmh && git pull --ff-only && bash deploy/incident-logins.sh"
set -uo pipefail
SINCE="${1:-2026-11-10}"
NOW_IP="${SSH_CLIENT%% *}"

country() { # country codes from the local DB-IP database inside aykdmh-app (no address leaves the server)
  docker exec aykdmh-app node -e '
    require("/app/server/services/geoip").countries(process.argv.slice(1))
      .then(r => { for (const ip of process.argv.slice(1)) console.log(ip, r[ip] || "?"); })
      .catch(() => {})' "$@" 2>/dev/null
}
prefix() { echo "$1" | cut -d. -f1-2; }

echo "== 1. Your connection right now =="
echo "   $NOW_IP  ($(country "$NOW_IP" | awk '{print $2}'))   network prefix $(prefix "$NOW_IP").x.x"

echo; echo "== 2. Every accepted sign-in since $SINCE (day, time UTC, method, user, address, country, same network as you now?) =="
logins=$(journalctl -u ssh -u sshd --since "$SINCE" --no-pager -o short-iso 2>/dev/null \
  | grep -E 'Accepted [a-z-]+ for' \
  | sed -E 's/^([0-9-]+)T([0-9:]+).*Accepted ([a-z-]+) for (\S+) from (\S+).*/\1 \2 \3 \4 \5/')
ips=$(echo "$logins" | awk 'NF{print $5}' | sort -u)
declare -A CC=()
while read -r ip cc; do [[ -n "${ip:-}" ]] && CC[$ip]=$cc; done < <(country $ips)
echo "$logins" | awk 'NF' | while read -r d t m u ip; do
  same=$([[ "$(prefix "$ip")" == "$(prefix "$NOW_IP")" ]] && echo "SAME network as you now" || echo "-")
  printf '   %s %s  %-10s %-6s %-16s %-3s %s\n' "$d" "${t:0:5}" "$m" "$u" "$ip" "${CC[$ip]:-?}" "$same"
done | uniq -c -f0 | tail -60
echo "-- summary by address:"
echo "$logins" | awk 'NF{print $5, $3}' | sort | uniq -c | while read -r n ip m; do
  printf '   %4s x %-10s %-16s %s\n' "$n" "$m" "$ip" "${CC[$ip]:-?}"; done

echo; echo "== 3. Session lengths (last) since $SINCE =="
last -F -s "$SINCE" 2>/dev/null | grep -vE '^(reboot|wtmp|$)' | awk '{print "   " $0}' | head -40

echo; echo "== 4. The account freellm-lab =="
echo "-- every log line mentioning it (created, signed in, deleted):"
journalctl --since 2026-01-01 --no-pager -o short-iso 2>/dev/null | grep -i 'freellm' \
  | grep -vE 'incident-logins' | head -40 | sed -E 's/^([0-9-]+T[0-9:]+)[^ ]* (\S+) /   \1 /'
echo "-- leftovers (folders, services, scheduled jobs, containers, images):"
find / -xdev \( -path /proc -o -path /sys -o -path /var/lib/docker \) -prune -o -iname '*freellm*' -print 2>/dev/null | head -20 | sed 's/^/   /'
grep -ril freellm /etc/systemd /etc/cron* /var/spool/cron 2>/dev/null | sed 's/^/   config: /'
docker ps -a --format '{{.Names}} {{.Image}} {{.CreatedAt}}' 2>/dev/null | grep -i freellm | sed 's/^/   container: /'
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' 2>/dev/null | grep -i freellm | sed 's/^/   image: /'
echo "-- root commands mentioning it (bash history):"
grep -n -i 'freellm' /root/.bash_history 2>/dev/null | tail -20 | sed -E 's/(password|token|secret|key)=\S*/\1=***/Ig; s/^/   /'

echo; echo "== 5. Contabo console (VNC) sign-ins since $SINCE =="
journalctl --since "$SINCE" --no-pager -o short-iso 2>/dev/null | grep -E 'login\[[0-9]+\]|by LOGIN' | tail -10 | sed 's/^/   /'
echo "   (none above = no console sign-in)"

echo; echo "== done (nothing was changed) =="
