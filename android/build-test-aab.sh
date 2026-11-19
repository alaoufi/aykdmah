#!/usr/bin/env bash
# AYK-167: signed bundle for owner-controlled Play internal testing; no upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${1:?Pass the isolated generated project}"
KEYS="${2:?Pass the private signing-key directory}"
test -f "$PROJECT/.ayk-native-test-copy"
test -f "$KEYS/secrets.env"
test -f "$KEYS/aykdmh-upload.keystore"
mkdir -p "$PROJECT/.maven-user-home"
# Google's Maven Central mirror avoids transient Central 429s; keep test SDKs cached.
docker run --rm -u root -v "$PROJECT:/work" -v "$PROJECT/.gradle-user-home:/root/.gradle" \
  -v "$PROJECT/.maven-user-home:/root/.m2" \
  -e AYK_ROBOLECTRIC_REPO=https://maven-central.storage-download.googleapis.com/maven2 \
  -v "$KEYS:/keys:ro" -v "$ROOT/android:/source:ro" -w /work \
  cimg/android:2024.10.1-node bash /source/tests/build-test-aab-inner.sh
