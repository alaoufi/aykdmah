#!/usr/bin/env bash
set -euo pipefail
test -f /work/.ayk-native-test-copy
cp /source/native/*.kt /source/native/*.java /work/app/src/main/java/sa/aykdmh/app/
node /source/tests/prepare-test-build.cjs
mkdir -p /work/app/src/test/java/sa/aykdmh/app
cp /source/tests/CallAudioRoutingTest.kt /work/app/src/test/java/sa/aykdmh/app/
cp /source/tests/test-config.gradle /work/app/ayk-native-tests.gradle
if ! grep -q 'ayk-native-tests.gradle' /work/app/build.gradle; then
  printf '\napply from: "ayk-native-tests.gradle"\n' >> /work/app/build.gradle
fi
./gradlew --no-daemon --console=plain --max-workers=2 :app:testDebugUnitTest \
  --tests 'sa.aykdmh.app.CallAudioRoutingTest' :app:bundleRelease --rerun-tasks
# Signing secrets are loaded only after Gradle and tests have exited.
set -a
. /keys/secrets.env
set +a
export AYK_TEST_KEYSTORE_PASS="$KEYSTORE_PASSWORD" AYK_TEST_KEY_PASS="$KEY_PASSWORD"
mkdir -p /work/private-artifacts
NAME=$(node -p 'JSON.parse(require("fs").readFileSync("/source/twa-manifest.json")).appVersionName')
TARGET="/work/private-artifacts/aykdmh-$NAME-test.aab"
cp /work/app/build/outputs/bundle/release/app-release.aab "$TARGET"
jarsigner -keystore /keys/aykdmh-upload.keystore \
  -storepass:env AYK_TEST_KEYSTORE_PASS -keypass:env AYK_TEST_KEY_PASS "$TARGET" aykdmh >/dev/null
jarsigner -verify "$TARGET"
keytool -printcert -jarfile "$TARGET" | grep 'SHA256:'
sha256sum "$TARGET"
