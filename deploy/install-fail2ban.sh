#!/usr/bin/env bash
# Install fail2ban for SSH (AYK-240, approved by the owner on 2026-11-16). Run as root:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/install-fail2ban.sh
# An address with 5 wrong SSH sign-ins within 10 minutes is blocked for 10 minutes. The address
# you are connected from now is never blocked. Only SSH is watched: the sites are not affected.
# Undo: rm /etc/fail2ban/jail.d/aykdmh-sshd.local && systemctl disable --now fail2ban
set -euo pipefail
MINE="${SSH_CLIENT%% *}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q fail2ban python3-systemd

cat > /etc/fail2ban/jail.d/aykdmh-sshd.local <<EOF
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 10m
ignoreip = 127.0.0.1/8 ::1 ${MINE}
EOF

systemctl enable fail2ban > /dev/null 2>&1
systemctl restart fail2ban
sleep 3
systemctl is-active fail2ban
fail2ban-client status sshd
echo "Done: fail2ban is watching SSH. Your current address (${MINE:-unknown}) is never blocked."
