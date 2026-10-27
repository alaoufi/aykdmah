#!/usr/bin/env bash
# Static checks for the deploy kit. Run from the repo root: bash tests/check-deploy.sh
set -u
cd "$(dirname "$0")/.."
fail=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fail=1; fi; }

page=deploy/landing/index.html
conf=deploy/caddy/Caddyfile
compose=deploy/docker-compose.yml
script=deploy/setup-server.sh

check "page is Arabic RTL"             "grep -q '<html lang=\"ar\" dir=\"rtl\">' $page"
check "page has viewport meta"         "grep -q 'name=\"viewport\"' $page"
check "page loads no external assets"  "! grep -Eq '(src|href)=\"https?://' $page"
check "page tags balanced"             "[ \$(grep -o '<div' $page | wc -l) -eq \$(grep -o '</div>' $page | wc -l) ]"
check "caddy serves apex domain"       "grep -q '^aykdmh.com {' $conf"
check "caddy redirects www"            "grep -q 'redir https://aykdmh.com{uri} permanent' $conf"
check "caddy braces balanced"          "[ \$(tr -cd '{' < $conf | wc -c) -eq \$(tr -cd '}' < $conf | wc -c) ]"
check "assets never fall back to html" "grep -q 'handle @assets' $conf"
check "compose pins caddy version"     "grep -Eq 'image: caddy:[0-9]+\.[0-9]+\.[0-9]+' $compose"
check "setup script syntax"            "bash -n $script"
check "setup script backs up firewall" "grep -q 'tar czf' $script"
check "setup script leaves SSH alone"  "! grep -Eq 'ufw (delete|deny|reset)|sshd' $script"
check "no secrets committed"           "! git ls-files | grep -Eq '(^|/)\.env'"

exit $fail
