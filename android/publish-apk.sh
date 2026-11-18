#!/bin/bash
# Publishes the APK that android/build.sh made at aykdmh.com/dl (AYK-124), for testing only, and the
# bundle for Google Play. Since AYK-292 no update screen points to it: updates come from the stores.
# Usage (as root on the server, after build.sh): bash android/publish-apk.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DL=/var/www/aykdmh/dl
VERSION=$(grep -o '"appVersionName": *"[0-9.]*"' "$REPO_DIR/android/twa-manifest.json" | grep -o '[0-9][0-9.]*')
[ -n "$VERSION" ] || { echo "no appVersionName in twa-manifest.json"; exit 1; }
cp /root/aykdmh-android/project/aykdmh.apk "$DL/aykdmh-$VERSION.apk"
cp /root/aykdmh-android/project/aykdmh.aab "/root/aykdmh-android/aykdmh-$VERSION.aab"
# The bundle for Google Play, downloadable at aykdmh.com/dl to upload in Play Console (AYK-164).
cp /root/aykdmh-android/project/aykdmh.aab "$DL/aykdmh-$VERSION.aab"
# AYK-292: no latest.json any more. Updates come from the stores only; older copies of the site
# still on phones showed a "download the file" screen whenever this file named a newer version.
rm -f "$DL/latest.json.tmp"
echo "published https://aykdmh.com/dl/aykdmh-$VERSION.apk (for testing only; no update screen points to it)"
