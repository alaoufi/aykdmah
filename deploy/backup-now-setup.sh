#!/usr/bin/env bash
# «Take a backup now» from the backups page (AYK-304), one-time setup. Run as root on the server:
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/backup-now-setup.sh
# Creates /var/lib/aykdmh/backup-requests (shared with the aykdmh-app container, user node = 1000),
# and two systemd units: aykdmh-backup-now.path watches for the request file the page leaves there,
# and aykdmh-backup-now.service runs deploy/backup.sh, the same script as the nightly backup.
# Touches nothing outside aykdmh. Idempotent. Undo: systemctl disable --now aykdmh-backup-now.path
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIR=/var/lib/aykdmh/backup-requests

install -d -o 1000 -g 1000 -m 750 "$DIR"

cat > /etc/systemd/system/aykdmh-backup-now.service <<UNIT
[Unit]
Description=aykdmh.com backup requested from the backups page
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=BACKUP_TRIGGER=manual
# The request is taken first, so the path unit does not start the backup a second time.
ExecStartPre=/usr/bin/rm -f $DIR/now
ExecStart=/usr/bin/bash $REPO_DIR/deploy/backup.sh
# The site comes first: the backup runs at low CPU and disk priority.
Nice=15
IOSchedulingClass=idle
StandardOutput=append:/var/log/aykdmh-backup.log
StandardError=append:/var/log/aykdmh-backup.log
UNIT

cat > /etc/systemd/system/aykdmh-backup-now.path <<UNIT
[Unit]
Description=Watch for «take a backup now» from the aykdmh.com backups page

[Path]
PathExists=$DIR/now
Unit=aykdmh-backup-now.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now aykdmh-backup-now.path > /dev/null
systemctl is-active --quiet aykdmh-backup-now.path && echo "OK: the backup-now button is ready (folder $DIR)" || { echo "NOT READY: aykdmh-backup-now.path is not active"; exit 1; }
