#!/usr/bin/env bash
# Remove Metabase and its read-only role (AYK-499). Run as root. The live site and its data are not touched.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/aykdmah/metabase.env
[[ $EUID -eq 0 ]] || { echo "Run as root."; exit 1; }
if [[ -f "$ENV_FILE" ]]; then
  LIVE_NETWORK="$(sed -n "s/^LIVE_NETWORK='\(.*\)'$/\1/p" "$ENV_FILE")" docker compose -p aykdmah-metabase --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/metabase.compose.yml" down -v
fi
if docker inspect aykdmah-db >/dev/null 2>&1; then
  DB_USER="$(docker exec aykdmah-db printenv POSTGRES_USER)"; DB_NAME="$(docker exec aykdmah-db printenv POSTGRES_DB)"
  docker exec aykdmah-db psql -q -U "$DB_USER" -d "$DB_NAME" -c "DROP OWNED BY aykdmah_report" -c "DROP ROLE IF EXISTS aykdmah_report"
fi
rm -f "$ENV_FILE"
echo "DONE: Metabase and the read-only role are removed"
