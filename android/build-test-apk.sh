#!/usr/bin/env bash
# Build a signed, local-only test APK from an isolated generated project.
# Does not publish to /dl, change latest.json, or modify the release work directory.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${1:?Pass the isolated generated project}"
KEYS="${2:?Pass the private signing-key directory}"
test -f "$PROJECT/.ayk-native-test-copy"
test -f "$KEYS/secrets.env"
test -f "$KEYS/aykdmh-upload.keystore"
docker run --rm -u root -v "$PROJECT:/work" -v "$PROJECT/.gradle-user-home:/root/.gradle" \
  -v "$KEYS:/keys:ro" -v "$ROOT/android:/source:ro" -w /work \
  cimg/android:2024.10.1-node bash /source/tests/build-test-apk-inner.sh
