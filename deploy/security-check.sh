#!/usr/bin/env bash
# Server security check for aykdmh.com (AYK-240). READ ONLY: changes nothing. Run as root:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/security-check.sh
# Prints findings as OK / WARN lines. Never prints secret values, only names, modes and counts.
set -uo pipefail
ok()   { echo "OK    $*"; }
warn() { echo "WARN  $*"; }
ENV=/opt/aykdmh/.env

echo "== 1. Open ports (listening on all addresses) =="
ss -Htlnu 2>/dev/null | awk '{print $1, $5}' | grep -vE ' (127\.|\[::1\]|172\.)' | sort -u
for p in 5432 5000 2019 8000 8093 6379; do
  if ss -Htln "( sport = :$p )" 2>/dev/null | grep -vE '127\.0\.0\.1|\[::1\]|172\.' | grep -q .; then warn "port $p listens publicly"; else ok "port $p not public"; fi
done

echo; echo "== 2. Firewall =="
if command -v ufw >/dev/null; then ufw status | head -20; ufw status | grep -q "Status: active" && ok "ufw active" || warn "ufw not active"; else warn "ufw not installed"; fi
echo "docker-published ports (bypass ufw):"; docker ps --format '{{.Names}}: {{.Ports}}' | grep -E '0\.0\.0\.0|:::' || echo "  none"

echo; echo "== 3. SSH =="
cfg="$(sshd -T 2>/dev/null)"
for k in permitrootlogin passwordauthentication pubkeyauthentication maxauthtries; do echo "  $k $(grep -i "^$k " <<< "$cfg" | awk '{print $2}')"; done
grep -qi '^passwordauthentication no' <<< "$cfg" && ok "SSH passwords off" || warn "SSH accepts passwords (use keys, then turn passwords off)"
grep -qiE '^permitrootlogin (no|prohibit-password|without-password)' <<< "$cfg" && ok "root cannot sign in by password" || warn "root can sign in with a password"
keys=$(grep -cE '^(ssh-|ecdsa-)' /root/.ssh/authorized_keys 2>/dev/null || echo 0); echo "  root authorized keys: $keys"
systemctl is-active fail2ban >/dev/null 2>&1 && ok "fail2ban active" || warn "fail2ban not active (blocks repeated SSH guesses)"
echo "  failed SSH sign-ins in the last 24h: $(journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -cE 'Failed password|Invalid user')"

echo; echo "== 4. Secrets file =="
if [[ -f $ENV ]]; then
  mode=$(stat -c '%a %U' "$ENV"); [[ "$mode" == "600 root" ]] && ok ".env mode $mode" || warn ".env mode $mode (should be 600 root)"
  for n in BOOTSTRAP_ADMIN_PASSWORD; do grep -qE "^$n=." "$ENV" && warn "$n still set (only needed once; remove it)" || ok "$n empty"; done
  # The running app's value (deploy/docker-compose.yml sets it, not only .env).
  [[ "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' aykdmh-app 2>/dev/null | sed -n 's/^PAYMENT_PROVIDER=//p')" == test ]] \
    && warn "PAYMENT_PROVIDER=test: subscriptions are free (switch off before a real gateway)" || ok "payment test mode off"
  len=$(sed -n 's/^JWT_SECRET=//p' "$ENV" | tr -d '\n' | wc -c); [[ $len -ge 32 ]] && ok "JWT_SECRET length $len" || warn "JWT_SECRET short ($len)"
else warn "$ENV not found"; fi
ls -la /root/backups 2>/dev/null | head -3

echo; echo "== 5. Updates and containers =="
if command -v apt >/dev/null; then echo "  pending security updates: $(apt list --upgradable 2>/dev/null | grep -ci security)"; fi
[[ -f /var/run/reboot-required ]] && warn "reboot required" || ok "no reboot required"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
echo "  app runs as user: $(docker exec aykdmh-app id -un 2>/dev/null || echo unknown)"
df -h / | tail -1

echo; echo "== 6. Live site =="
curl -sI https://aykdmh.com/ | grep -iE '^(strict-transport|content-security|x-frame)' | cut -c1-120
code=$(curl -s -o /dev/null -w '%{http_code}' http://aykdmh.com/); [[ $code == 308 || $code == 301 ]] && ok "http redirects to https ($code)" || warn "http answers $code"
echo; echo "== done (nothing was changed) =="
