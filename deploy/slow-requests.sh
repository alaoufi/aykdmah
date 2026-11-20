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
echo; echo "== Phone notifications: ready or not (AYK-348; yes/no only, no key is shown) =="
docker exec aykdmh-app node -e '
const e = process.env, yes = v => (v ? "yes" : "NO");
let fcm = false; try { const a = JSON.parse(Buffer.from(e.FCM_SERVICE_ACCOUNT_B64 || "", "base64").toString()); fcm = Boolean(a.client_email && a.private_key && a.project_id); } catch (_) {}
console.log("   Android (Firebase) key:", yes(fcm));
const apns = Boolean(e.APNS_KEY_ID && e.APNS_TEAM_ID && e.APNS_BUNDLE_ID && String(e.APNS_KEY || "").includes("PRIVATE KEY"));
console.log("   iPhone (Apple APNs) key:", yes(apns), e.APNS_SANDBOX === "1" ? "(test server)" : "");
console.log("   web push key:", yes(e.PUSH_PUBLIC_KEY && e.PUSH_PRIVATE_KEY));
' 2>&1 | sed 's/^/ /'
docker exec aykdmh-db psql -U aykdmh -d aykdmh -tA -F ' ' -c "
SELECT '   phones registered: iPhone', COUNT(*) FILTER (WHERE token ~ '^[0-9a-f]{64}$'), '· Android', COUNT(*) FILTER (WHERE token !~ '^[0-9a-f]{64}$'),
       '· updated in the last 7 days', COUNT(*) FILTER (WHERE updated_at > now() - interval '7 days') FROM native_push_tokens;
SELECT '   browsers registered for web push:', COUNT(*) FROM push_subscriptions;" 2>&1
echo "-- sending in the last ${H}h:"
docker logs --since "${H}h" aykdmh-app 2>&1 | grep -E 'FCM send failed|APNs send failed|APNs connection' | sed -E 's/user=[0-9]+/user=…/' | sort | uniq -c | sort -rn | head -8 | sed 's/^/   /'
docker logs --since "${H}h" aykdmh-app 2>&1 | grep -cE 'FCM send failed|APNs send failed|APNs connection' | sed 's/^/   failures logged: /'
echo; echo "== done (nothing was changed) =="
