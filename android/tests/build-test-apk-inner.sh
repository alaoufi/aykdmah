#!/usr/bin/env bash
set -euo pipefail
test -f /work/.ayk-native-test-copy
node --test /source/tests/manifest-permissions.test.cjs
cp /source/native/*.kt /source/native/*.java /work/app/src/main/java/sa/aykdmh/app/
node /source/tests/prepare-test-build.cjs
mkdir -p /work/app/src/test/java/sa/aykdmh/app
cp /source/tests/CallAudioRoutingTest.kt /work/app/src/test/java/sa/aykdmh/app/
cp /source/tests/test-config.gradle /work/app/ayk-native-tests.gradle
if ! grep -q 'ayk-native-tests.gradle' /work/app/build.gradle; then
  printf '\napply from: "ayk-native-tests.gradle"\n' >> /work/app/build.gradle
fi
set +o pipefail
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-36" "build-tools;35.0.0" >/dev/null 2>&1
set -o pipefail
./gradlew --no-daemon --console=plain --max-workers=2 :app:testDebugUnitTest \
  --tests 'sa.aykdmh.app.CallAudioRoutingTest' :app:assembleRelease
set -a
. /keys/secrets.env
set +a
export AYK_TEST_KEYSTORE_PASS="$KEYSTORE_PASSWORD" AYK_TEST_KEY_PASS="$KEY_PASSWORD"
BT="$ANDROID_HOME/build-tools/35.0.0"
mkdir -p /work/private-artifacts
NAME=$(node -p 'JSON.parse(require("fs").readFileSync("/source/twa-manifest.json")).appVersionName')
"$BT/zipalign" -f -p 4 /work/app/build/outputs/apk/release/app-release-unsigned.apk /work/private-artifacts/aligned.apk
"$BT/apksigner" sign --ks /keys/aykdmh-upload.keystore --ks-key-alias aykdmh \
  --ks-pass env:AYK_TEST_KEYSTORE_PASS --key-pass env:AYK_TEST_KEY_PASS \
  --out "/work/private-artifacts/aykdmh-$NAME-test.apk" /work/private-artifacts/aligned.apk
"$BT/apksigner" verify "/work/private-artifacts/aykdmh-$NAME-test.apk"
"$BT/aapt" dump badging "/work/private-artifacts/aykdmh-$NAME-test.apk" | sed -n '1p'
sha256sum "/work/private-artifacts/aykdmh-$NAME-test.apk"
rm -f /work/private-artifacts/aligned.apk
