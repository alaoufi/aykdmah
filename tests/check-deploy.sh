#!/usr/bin/env bash
# Static checks for the deploy kit. Run from the repo root: bash tests/check-deploy.sh
set -u
cd "$(dirname "$0")/.."
fail=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fail=1; fi; }

page=deploy/landing/index.html
conf=deploy/nginx/aykdmh.com.conf
script=deploy/setup-server.sh

check "page is Arabic RTL"            "grep -q '<html lang=\"ar\" dir=\"rtl\">' $page"
check "page has viewport meta"        "grep -q 'name=\"viewport\"' $page"
check "page loads no external assets" "! grep -Eq '(src|href)=\"https?://' $page"
check "page tags balanced"            "[ \$(grep -o '<div' $page | wc -l) -eq \$(grep -o '</div>' $page | wc -l) ]"
check "nginx serves both hostnames"   "grep -q 'server_name aykdmh.com www.aykdmh.com;' $conf"
check "nginx braces balanced"         "[ \$(tr -cd '{' < $conf | wc -c) -eq \$(tr -cd '}' < $conf | wc -c) ]"
check "missing assets return 404"     "grep -q 'try_files \$uri =404;' $conf"
check "setup script syntax"           "bash -n $script"
check "setup script backs up nginx"   "grep -q 'tar czf' $script"
check "setup script keeps SSH open"   "grep -q 'ufw allow OpenSSH' $script"
check "no secrets committed"          "! git ls-files | grep -Eq '(^|/)\.env'"

exit $fail
