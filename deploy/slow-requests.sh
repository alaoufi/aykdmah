#!/usr/bin/env bash
# How long the app takes to answer, from its own request log (method, path, status, ms). READ ONLY.
# Run as root:  bash /opt/aykdmh/deploy/slow-requests.sh [hours, default 24]
set -uo pipefail
H="${1:-24}"
log=$(docker logs --since "${H}h" aykdmh-app 2>&1 | grep -E '^(GET|POST|PUT|PATCH|DELETE) \S+ [0-9]{3} [0-9.]+ ms$')
echo "== Sign-ins in the last ${H}h (newest last): status, ms =="
echo "$log" | grep -E '^POST \S*login' | tail -15 | awk '{printf "   %s %s  %6.0f ms\n", $2, $3, $4}'
echo "-- sign-in summary:"
echo "$log" | grep -E '^POST \S*login' | awk '{n++; s+=$4; if ($4>m) m=$4} END {if (n) printf "   %d sign-ins, average %.0f ms, slowest %.0f ms\n", n, s/n, m; else print "   none in the log"}'
echo; echo "== Slowest 15 requests in the last ${H}h =="
echo "$log" | sort -k4,4 -n -r | head -15 | awk '{printf "   %6.0f ms  %s %s %s\n", $4, $1, $2, $3}'
echo; echo "== Average by path (paths with 5+ requests, slowest first) =="
echo "$log" | awk '{p=$1" "$2; n[p]++; s[p]+=$4} END {for (p in n) if (n[p]>=5) printf "%8.0f ms  %5d x  %s\n", s[p]/n[p], n[p], p}' | sort -n -r | head -12 | sed 's/^/ /'
echo; echo "== Server load now =="
echo "   $(uptime | sed 's/.*load average/load average/')"
docker stats --no-stream --format '   {{.Name}}: CPU {{.CPUPerc}}, memory {{.MemUsage}}' aykdmh-app aykdmh-db 2>/dev/null
echo; echo "== done (nothing was changed) =="
