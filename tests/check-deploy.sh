#!/usr/bin/env bash
# Static checks for the deploy kit. Run from the repo root: bash tests/check-deploy.sh
set -u
cd "$(dirname "$0")/.."
fail=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fail=1; fi; }

conf=deploy/caddy/Caddyfile
compose=deploy/docker-compose.yml
script=deploy/setup-server.sh
dockerfile=deploy/app.Dockerfile

check "caddy serves apex domain"        "grep -q '^aykdmh.com {' $conf"
check "caddy redirects www"             "grep -q 'redir https://aykdmh.com{uri} permanent' $conf"
check "caddy braces balanced"           "[ \$(tr -cd '{' < $conf | wc -c) -eq \$(tr -cd '}' < $conf | wc -c) ]"
check "caddy proxies api to app"        "grep -q 'reverse_proxy app:5000' $conf"
check "caddy keeps vercel CSP"          "grep -q \"script-src 'self' 'wasm-unsafe-eval'\" $conf"
check "missing static files 404"        "grep -q 'handle @static' $conf"
check "install and uploads blocked"     "grep -q '@private path /install' $conf"
check "compose pins caddy version"      "grep -Eq 'image: caddy:[0-9]+\.[0-9]+\.[0-9]+' $compose"
check "only web publishes ports"        "[ \$(grep -c '^    ports:' $compose) -eq 1 ]"
check "compose requires secrets"        "grep -q 'JWT_SECRET: \${JWT_SECRET:?' $compose"
check "app trusts proxy"                "grep -q 'TRUST_PROXY: \"1\"' $compose"
check "app runs as non-root"            "grep -q '^USER node' $dockerfile"
check "setup script syntax"             "bash -n $script"
check "setup script backs up database"  "grep -q 'pg_dump' $script"
check "setup script backs up firewall"  "grep -q 'tar czf' $script"
check "setup script leaves SSH alone"   "! grep -Eq 'ufw (delete|deny|reset)|sshd' $script"
check "env files ignored by git"        "git check-ignore -q .env"
check "no secrets committed"            "! git ls-files | grep -Eq '(^|/)\.env(\.local|\.production)?$'"

exit $fail
