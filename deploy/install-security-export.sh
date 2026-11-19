#!/usr/bin/env bash
# Install the timer that feeds the admin security report with server events (AYK-242).
# Run as root after a release that includes migration 084:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/install-security-export.sh
# Every 10 minutes: failed SSH sign-ins and fail2ban bans -> security_events. Reads logs only.
# Undo: systemctl disable --now aykdmh-security-export.timer && rm /etc/systemd/system/aykdmh-security-export.*
set -euo pipefail
cat > /etc/systemd/system/aykdmh-security-export.service <<'EOF'
[Unit]
Description=aykdmh security report: export SSH and fail2ban events
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/aykdmh/deploy/security-export.py
EOF
cat > /etc/systemd/system/aykdmh-security-export.timer <<'EOF'
[Unit]
Description=aykdmh security report export every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now aykdmh-security-export.timer
/usr/bin/python3 /opt/aykdmh/deploy/security-export.py
systemctl list-timers aykdmh-security-export.timer --no-pager | head -3
echo "Done: the security report in the admin area now shows server attempts."
