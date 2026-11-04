#!/bin/bash
# SSH-only fallback for the owner's PC while private-network enrollment is pending.
set -eu -o pipefail
umask 077
script=$(realpath "$(dirname "$0")/socket.cjs")
cd /opt/private-agent-console
socketdir=$PWD/ssh-bridge
install -d -m 700 -o 31072 -g 31072 "$socketdir"
if [[ ! -s "$socketdir/cert.pem" || ! -s "$socketdir/key.pem" ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 180 -subj /CN=localhost \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -addext 'basicConstraints=critical,CA:FALSE' \
    -out "$socketdir/cert.pem" -keyout "$socketdir/key.pem" >/dev/null 2>&1
  chown 31072:31072 "$socketdir/cert.pem" "$socketdir/key.pem"
fi
install -m600 -o 31072 -g 31072 "$script" "$socketdir/socket.cjs"
openssl x509 -in "$socketdir/cert.pem" -pubkey -noout | openssl pkey -pubin -outform der |
  openssl dgst -sha256 -binary | openssl base64 -A > ssh-public-pin
image=node@sha256:18a6d90fd60542269850c80ca03b29b1d9b14d6b221ac7ee8e35b0d33ef904bd
if ! docker container inspect agent-console-ssh >/dev/null 2>&1; then
  docker run -d --name agent-console-ssh --restart unless-stopped --network container:agent-console-net \
    --user 31072:31072 --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 96m --pids-limit 32 --cpus .25 --log-opt max-size=2m --log-opt max-file=2 \
    --mount "type=bind,src=$socketdir,dst=/bridge" "$image" node /bridge/socket.cjs >/dev/null
fi
