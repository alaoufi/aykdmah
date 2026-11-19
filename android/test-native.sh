#!/usr/bin/env bash
# Run against a disposable copy of a Bubblewrap-generated project, never the
# release build directory. No signing keys or production configuration needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${1:?Pass an isolated generated Android project}"
test -f "$PROJECT/app/build.gradle"
test -f "$PROJECT/.ayk-native-test-copy" || { echo 'Refusing to modify a project without the isolated-test-copy marker'; exit 1; }
mkdir -p "$PROJECT/app/src/test/java/sa/aykdmh/app"
cp "$ROOT"/android/tests/*.kt "$PROJECT/app/src/test/java/sa/aykdmh/app/"
if ! grep -q 'ayk-native-tests.gradle' "$PROJECT/app/build.gradle"; then
  printf '\napply from: "ayk-native-tests.gradle"\n' >> "$PROJECT/app/build.gradle"
fi
cp "$ROOT/android/tests/test-config.gradle" "$PROJECT/app/ayk-native-tests.gradle"
mkdir -p "$PROJECT/.gradle-user-home"
docker run --rm -u root -v "$PROJECT:/work" -v "$PROJECT/.gradle-user-home:/root/.gradle" -w /work \
  cimg/android:2024.10.1-node bash -c '
    set -e
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-36" "build-tools;35.0.0" >/dev/null 2>&1
    ./gradlew --no-daemon --console=plain :app:testDebugUnitTest --tests "sa.aykdmh.app.CallAudioRoutingTest"'
