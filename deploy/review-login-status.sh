#!/usr/bin/env bash
# Why could App Review not sign in? (AYK-236). Read only; run as root on the server:
#   bash /opt/aykdmh/deploy/review-login-status.sh
# Prints the review accounts' sign-in state (no password, no hash, no phone number) and the
# API's record of sign-in attempts in the last days (time and HTTP status only).
# The API container is recreated on each release, so its log starts at the last release.
set -uo pipefail
DAYS="${1:-3}"

echo "== Review accounts =="
docker exec aykdmh-db psql -U aykdmh -d aykdmh -P pager=off -c "
  SELECT id, username, role, is_active, is_blocked, failed_logins, login_locked_at,
         must_change_password, last_login_at, (phone IS NOT NULL AND phone <> '') AS has_phone,
         (password_hash IS NOT NULL AND password_hash <> '') AS has_password, deleted_at
  FROM users WHERE username LIKE 'apple_review%' OR username LIKE 'google_review%' ORDER BY id;"

echo "== Sign-in requests to the API in the last $DAYS days (time, status, duration) =="
docker logs --timestamps --since "$((DAYS * 24))h" aykdmh-app 2>&1 | grep -E 'POST /api/auth/login ' | awk '{print $1, $4, $5, $6}' | tail -60
echo "== Count by status =="
docker logs --since "$((DAYS * 24))h" aykdmh-app 2>&1 | grep -E 'POST /api/auth/login ' | awk '{print $3}' | sort | uniq -c

echo "== API restarts in the last $DAYS days (a sign-in during a restart gets an error) =="
docker logs --timestamps --since "$((DAYS * 24))h" aykdmh-app 2>&1 | grep -E 'Server listening' | awk '{print $1}'
