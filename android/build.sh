#!/bin/bash
# Builds the Ay Khidmah Android app (Trusted Web Activity) with Bubblewrap, on the server.
# The signing key and its password stay in /root/aykdmh-android/keys (never in the repository).
# Usage (as root on the server): bash android/build.sh   → /root/aykdmh-android/project/app-release-bundle.aab
set -euo pipefail
WORK=/root/aykdmh-android
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$WORK/project"
cp "$REPO_DIR/android/twa-manifest.json" "$WORK/project/twa-manifest.json"
set -a; . "$WORK/keys/secrets.env"; set +a

cat > "$WORK/inner.sh" <<'INNER'
set -euo pipefail
npm i -g @bubblewrap/cli >/dev/null 2>&1
echo "bubblewrap $(npm ls -g @bubblewrap/cli --depth=0 2>/dev/null | grep -o 'cli@[0-9.]*')"
mkdir -p /root/.bubblewrap
printf '{"jdkPath":"%s","androidSdkPath":"%s"}' "$JAVA_HOME" "$ANDROID_HOME" > /root/.bubblewrap/config.json
cd /work
# Bubblewrap's own installer uses the legacy sdkmanager (needs Java 8): install what it needs
# with the current one first, so it finds them and skips its installer.
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "build-tools;34.0.0" "platforms;android-34" >/dev/null 2>&1 || true
# `yes` answers Bubblewrap's prompts; it ends with SIGPIPE, so pipefail is off here.
set +o pipefail
yes | bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json
set -o pipefail
# Bubblewrap generated the Gradle project; build and sign it directly (its own "build" step
# insists on the legacy sdkmanager). The bundle (.aab) is for Google Play; the .apk is for
# installing on a phone directly to test.
./gradlew --no-daemon -q bundleRelease assembleRelease
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
cp app/build/outputs/bundle/release/app-release.aab /work/aykdmh.aab
jarsigner -keystore /keys/aykdmh-upload.keystore -storepass "$BUBBLEWRAP_KEYSTORE_PASSWORD" -keypass "$BUBBLEWRAP_KEY_PASSWORD" \
  /work/aykdmh.aab aykdmh >/dev/null
"$BT/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk /work/aykdmh-aligned.apk
"$BT/apksigner" sign --ks /keys/aykdmh-upload.keystore --ks-key-alias aykdmh \
  --ks-pass env:BUBBLEWRAP_KEYSTORE_PASSWORD --key-pass env:BUBBLEWRAP_KEY_PASSWORD --out /work/aykdmh.apk /work/aykdmh-aligned.apk
rm -f /work/aykdmh-aligned.apk /work/aykdmh.apk.idsig
"$BT/apksigner" verify /work/aykdmh.apk && echo "APK signature OK"
jarsigner -verify /work/aykdmh.aab >/dev/null && echo "AAB signature OK"
ls -la /work/aykdmh.aab /work/aykdmh.apk
INNER

docker run --rm -u root \
  -e BUBBLEWRAP_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD" -e BUBBLEWRAP_KEY_PASSWORD="$KEY_PASSWORD" \
  -v "$WORK/project":/work -v "$WORK/keys":/keys -v "$WORK/inner.sh":/inner.sh:ro \
  cimg/android:2024.10.1-node bash /inner.sh
