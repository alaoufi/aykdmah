#!/bin/bash
# Operates only on the independent private console; run as its host administrator.
set -eu -o pipefail
umask 077
cd /opt/private-agent-console
root=$PWD
sidecar=agent-console-net
web=agent-console-web
guard='private-agent-console.web'
source_image='tailscale/tailscale@sha256:ed6480b33c6eb67c9cbd203ed42b9fb57e361986725b6856def71b7a3d9e276c'

prepare() {
  install -d -m700 tailscale backups
  install -d -m700 -o 31071 -g 31071 auth data
  if [[ ! -s owner-password ]]; then openssl rand -hex 24 > owner-password; fi
  if [[ ! -s session-secret ]]; then openssl rand -hex 48 > session-secret; fi
  if ! docker network inspect private-agent-console-net >/dev/null 2>&1; then
    docker network create --driver bridge --opt com.docker.network.bridge.enable_icc=false private-agent-console-net >/dev/null
  fi
  if ! docker container inspect "$sidecar" >/dev/null 2>&1; then
    docker run -d --name "$sidecar" --restart unless-stopped --network private-agent-console-net \
      --cap-drop ALL --security-opt no-new-privileges --read-only \
      --tmpfs /tmp:rw,noexec,nosuid,size=24m --tmpfs /var/run:rw,noexec,nosuid,size=4m \
      --memory=192m --cpus=.5 --pids-limit=96 --log-opt max-size=2m --log-opt max-file=2 \
      --mount "type=bind,source=$root/tailscale,target=/var/lib/tailscale" \
      --entrypoint=/usr/local/bin/tailscaled "$source_image" --tun=userspace-networking \
      --statedir=/var/lib/tailscale --socket=/var/run/tailscale/tailscaled.sock >/dev/null
  fi
}

healthy() {
  docker exec "$web" node -e 'require("node:http").get("http://127.0.0.1:4318/", { headers: { Host: new URL(process.env.AGENT_ORIGIN).host } }, r => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1))'
}

activate() {
  local revision=$1 origin=$2 image previous=''
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]]
  [[ "$origin" == 'https://localhost' || "$origin" =~ ^https://[a-z0-9-]+\.[a-z0-9.-]+\.ts\.net$ ]]
  image="private-agent-console-web:$revision"
  docker image inspect "$image" >/dev/null
  if docker container inspect "$web" >/dev/null 2>&1; then
    [[ "$(docker inspect -f '{{ index .Config.Labels "service" }}' "$web")" == "$guard" ]]
    if [[ "$(docker inspect -f '{{.Config.Image}}' "$web")" == "$image" &&
          "$(docker inspect -f '{{ index .Config.Labels "origin" }}' "$web")" == "$origin" ]] && healthy; then
      return 0
    fi
    previous="$web-$(date -u +%s)"
    docker stop "$web" >/dev/null
    docker rename "$web" "$previous"
  fi
  export AGENT_CONSOLE_PASSWORD SESSION_SECRET
  AGENT_CONSOLE_PASSWORD=$(cat owner-password)
  SESSION_SECRET=$(cat session-secret)
  if docker run -d --name "$web" --restart unless-stopped --network "container:$sidecar" \
    --label "service=$guard" --label "origin=$origin" --user 31071:31071 --read-only \
    --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=8m \
    --pids-limit=64 --memory=256m --cpus=.5 --log-opt max-size=2m --log-opt max-file=2 \
    -e AGENT_CONSOLE_PASSWORD -e SESSION_SECRET -e "AGENT_ORIGIN=$origin" \
    -e AGENT_DATA_DIR=/data -e AGENT_AUTH_DIR=/auth -e AGENT_ENABLED_PROVIDERS=codex \
    --mount "type=bind,source=$root/data,target=/data" --mount "type=bind,source=$root/auth,target=/auth" \
    "$image" >/dev/null; then
    for i in $(seq 1 15); do
      if healthy 2>/dev/null; then return 0; fi
      sleep 1
    done
  fi
  if [[ "$(docker inspect -f '{{ index .Config.Labels "service" }}' "$web" 2>/dev/null || :)" == "$guard" ]]; then
    docker rm -f "$web" >/dev/null
  fi
  if [[ -n "$previous" ]]; then docker rename "$previous" "$web"; docker start "$web" >/dev/null; fi
  echo 'Private console failed startup; checked prior service for rollback.' >&2
  return 1
}

case "${1:-}" in
  prepare) prepare ;;
  stage) activate "$2" https://localhost ;;
  serve)
    status=$(docker exec "$sidecar" tailscale status --json)
    [[ "$(jq -r .BackendState <<<"$status")" == Running ]] || { echo 'Awaiting private network login'; exit 4; }
    name=$(jq -er '.Self.DNSName | rtrimstr(".")' <<<"$status")
    activate "$2" "https://$name"
    timeout 20 docker exec "$sidecar" tailscale serve --bg --https=443 http://127.0.0.1:4318
    ;;
  *) echo "Usage: $0 prepare | stage FULL_COMMIT | serve FULL_COMMIT" >&2; exit 2 ;;
esac
