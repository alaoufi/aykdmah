#!/usr/bin/env bash
# What do aykdmh.com and jdatna.com share on this server? (AYK-241). READ ONLY: changes nothing.
#   cd /opt/aykdmh && git pull --ff-only && bash deploy/isolation-inventory.sh
# Prints names, networks, ports, mounts and file paths only; never environment values or secrets.
set -uo pipefail
echo "== 1. Containers: project, networks, published ports =="
for c in $(docker ps -a --format '{{.Names}}' | sort); do
  proj=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c" 2>/dev/null)
  cool=$(docker inspect -f '{{index .Config.Labels "coolify.projectName"}}{{index .Config.Labels "coolify.serviceName"}}' "$c" 2>/dev/null)
  nets=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$c")
  ports=$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}->{{$p}} {{end}}{{end}}' "$c")
  state=$(docker inspect -f '{{.State.Status}}' "$c")
  echo "$c | $state | project=${proj:-none} coolify=${cool:-none} | nets: $nets| ports: ${ports:-none}"
done

echo; echo "== 2. Networks and their members =="
for n in $(docker network ls --format '{{.Name}}' | grep -vE '^(host|none)$'); do
  echo "$n ($(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$n")): $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$n")"
done

echo; echo "== 3. Mounts outside each project's own folder =="
for c in $(docker ps --format '{{.Names}}'); do
  docker inspect -f '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' "$c" | tr ' ' '\n' | grep -E '/(opt|etc|var/www|srv|root)/' | sed "s#^#$c  #"
done | sort -u

echo; echo "== 4. Listeners on the docker gateway (reachable by every container on it) =="
ss -Htln | awk '{print $4}' | grep -E '^172\.' | sort -u

echo; echo "== 5. Folders, timers and cron jobs naming either site =="
ls -d /opt/* /etc/aykdmh /etc/jdatna /var/www/* /srv/* 2>/dev/null
systemctl list-timers --all --no-legend 2>/dev/null | grep -iE 'aykdmh|jdatna|aser' || echo "  timers: none named"
grep -rlsE 'aykdmh|jdatna' /etc/cron* /var/spool/cron 2>/dev/null || echo "  cron: none named"
for f in $(grep -rlsE 'aykdmh' /opt/jdatna /opt/aser 2>/dev/null | grep -v '/node_modules/' | head -20); do echo "  jdatna file mentions aykdmh: $f"; done
for f in $(grep -rlsE 'jdatna' /opt/aykdmh 2>/dev/null | grep -vE '/(node_modules|\.git)/' | head -20); do echo "  aykdmh file mentions jdatna: $f"; done

echo; echo "== 6. Which proxy serves each domain =="
for d in aykdmh.com jdatna.com; do echo "$d: $(curl -sI --max-time 10 https://$d/ | grep -iE '^(server|via):' | tr -d '\r' | tr '\n' ' ')"; done
docker ps --format '{{.Names}}' | grep -iE 'coolify-proxy|traefik' || echo "  no Coolify/Traefik proxy container"
echo; echo "== done (nothing was changed) =="
