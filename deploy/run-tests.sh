#!/usr/bin/env bash
# Run the full test suite on a Linux host with Docker, mirroring .github/workflows/ci.yml:
# Node 22 plus a throwaway PostgreSQL 16 that is removed afterwards. Never touches
# the production database. Usage: bash deploy/run-tests.sh [repo-dir]
set -uo pipefail

REPO_DIR="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
PG=ayk-pgtest-$$
trap 'docker rm -f "$PG" >/dev/null 2>&1' EXIT

docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

docker run --rm --network "container:$PG" -v "$REPO_DIR":/src -w /src -e HOME=/tmp \
  -e ONNXRUNTIME_NODE_INSTALL_CUDA=skip -e AYK_TEST_PORT=5432 node:22-bookworm bash -c '
fail=0
step() { name=$1; shift; echo "== $name"; if "$@" > /tmp/out.log 2>&1; then echo "   ok"; else echo "   FAILED"; fail=1; fi
         grep -E "^# (tests|pass|fail) |locales share|vulnerabilit|built in" /tmp/out.log | sed "s/^/   /"
         grep -E "^not ok" /tmp/out.log | head -20 | sed "s/^/   /"; }
step "install" sh -c "npm ci --no-audit --no-fund && npm --prefix server ci --no-audit --no-fund && npm --prefix client ci --no-audit --no-fund"
step "server unit tests" npm test
step "client tests" sh -c "node --test client/tests/*.test.js client/tests/*.test.mjs"
step "translations" npm run i18n:check
step "integration tests" npm run test:integration
step "production build" sh -c "VITE_REALTIME_MODE=polling npm run build"
step "audit (server runtime)" npm --prefix server audit --omit=dev
step "audit (client runtime)" npm --prefix client audit --omit=dev
step "deploy checks" bash tests/check-deploy.sh
exit $fail'
