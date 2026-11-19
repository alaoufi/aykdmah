#!/usr/bin/env bash
# App Review accounts (AYK-291): one new password for apple_review_client and apple_review_provider,
# typed here and never shown, then the sign-in lock lifted, then their state shown (no password).
# Run as root on the server, in an interactive terminal (ssh -t):
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/review-reset.sh
# Then put the same password in App Store Connect (App Review Information), Google Play Console
# (App content -> App access) and the GitHub secret REVIEW_VIDEO_PASSWORD of alaoufi/apple-apps.
set -euo pipefail
docker exec -it aykdmh-app node server/scripts/review-accounts.js
docker exec aykdmh-db psql -U aykdmh -d aykdmh -q -c "UPDATE users SET failed_logins = 0, login_locked_at = NULL
  WHERE username IN ('apple_review_client', 'apple_review_provider')"
docker exec aykdmh-db psql -U aykdmh -d aykdmh -P pager=off -c "SELECT username, role, is_active, is_blocked,
  failed_logins, login_locked_at FROM users WHERE username IN ('apple_review_client', 'apple_review_provider') ORDER BY username"
echo "DONE. Sign in once at https://aykdmh.com/login with apple_review_client and the new password to prove it."
