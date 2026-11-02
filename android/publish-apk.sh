#!/bin/bash
# Publishes the APK that android/build.sh made for download at aykdmh.com/dl (AYK-124), and marks
# it as the newest one (AYK-148): apps installed from there that are older must update before
# they work again (client/src/components/common/AppUpdateGate.jsx reads /dl/latest.json).
# Usage (as root on the server, after build.sh): bash android/publish-apk.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DL=/var/www/aykdmh/dl
VERSION=$(grep -o '"appVersionName": *"[0-9.]*"' "$REPO_DIR/android/twa-manifest.json" | grep -o '[0-9][0-9.]*')
[ -n "$VERSION" ] || { echo "no appVersionName in twa-manifest.json"; exit 1; }
cp /root/aykdmh-android/project/aykdmh.apk "$DL/aykdmh-$VERSION.apk"
cp /root/aykdmh-android/project/aykdmh.aab "/root/aykdmh-android/aykdmh-$VERSION.aab"
printf '{"version":"%s","url":"/dl/aykdmh-%s.apk"}\n' "$VERSION" "$VERSION" > "$DL/latest.json.tmp"
mv "$DL/latest.json.tmp" "$DL/latest.json"
echo "published https://aykdmh.com/dl/aykdmh-$VERSION.apk (latest.json → $VERSION)"
