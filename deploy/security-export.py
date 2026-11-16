#!/usr/bin/env python3
"""Server security events -> security_events table (AYK-242), for the admin security report.

Run by the aykdmh-security-export timer every 10 minutes (deploy/install-security-export.sh).
- Failed SSH sign-ins from the journal: one row per address and hour with the count and up to
  five user names tried. The last 3 hours are recounted on every run, so a run is idempotent.
- fail2ban bans from /var/log/fail2ban.log: one row per ban.
- Rows older than 90 days are deleted.
Reads logs only; writes only the security_events table. Never records passwords.
"""
import csv, io, json, os, re, subprocess, sys
from collections import defaultdict
from datetime import datetime, timezone

STATE = os.environ.get('SECURITY_EXPORT_STATE', '/var/lib/aykdmh-security-export')
FIRST_RUN = not os.path.exists(f'{STATE}/done')
SINCE = '-48h' if FIRST_RUN else '-3h'
FAILED = re.compile(r'Failed (?:password|publickey|keyboard-interactive/pam|none) for (?:invalid user )?(\S*) from (\S+) port')
BAN = re.compile(r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d),\d+ .*\[(\S+)\] Ban (\S+)')


def clean(name):
    return re.sub(r'[^\w.@-]', '?', name)[:32] or '?'


def ssh_rows():
    if os.environ.get('SECURITY_EXPORT_JOURNAL'):  # tests: a file of journal JSON lines
        out = open(os.environ['SECURITY_EXPORT_JOURNAL'], encoding='utf-8').read()
    else:
        out = subprocess.run(['journalctl', '-u', 'ssh', '-u', 'sshd', '--since', SINCE, '-o', 'json', '--no-pager'],
                             capture_output=True, text=True, check=False).stdout
    buckets = defaultdict(lambda: {'n': 0, 'last': None, 'users': []})
    for line in out.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        message = entry.get('MESSAGE')
        if not isinstance(message, str):
            continue
        match = FAILED.search(message)
        if not match:
            continue
        at = datetime.fromtimestamp(int(entry['__REALTIME_TIMESTAMP']) / 1e6, timezone.utc)
        hour = at.replace(minute=0, second=0, microsecond=0)
        b = buckets[(match.group(2), hour)]
        b['n'] += 1
        b['last'] = max(b['last'] or at, at)
        user = clean(match.group(1))
        if user not in b['users'] and len(b['users']) < 5:
            b['users'].append(user)
    for (ip, hour), b in buckets.items():
        yield ['ssh', 'ssh_failed', 'failed', ip, b['n'], ', '.join(b['users']), hour.isoformat(), b['last'].isoformat()]


def ban_rows():
    for path in os.environ.get('SECURITY_EXPORT_F2B', '/var/log/fail2ban.log /var/log/fail2ban.log.1').split():
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8', errors='replace') as handle:
            for line in handle:
                match = BAN.search(line)
                if match:
                    # fail2ban logs local time; convert to UTC like the journal rows.
                    at = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S').astimezone(timezone.utc)
                    yield ['ssh', 'ssh_banned', 'blocked', match.group(3), 1, f'fail2ban {match.group(2)}', at.isoformat(), at.isoformat()]


def main():
    rows = list(ssh_rows()) + list(ban_rows())
    data = io.StringIO()
    csv.writer(data, lineterminator='\n').writerows(rows)
    sql = (
        'CREATE TEMP TABLE incoming (source text, event text, status text, ip text, attempts int, detail text, first_at timestamptz, last_at timestamptz);\n'
        'COPY incoming FROM STDIN WITH (FORMAT csv);\n' + data.getvalue() + '\\.\n'
        "INSERT INTO security_events (source, event, status, ip, attempts, detail, first_at, last_at)\n"
        "  SELECT source, event, status, ip, attempts, detail, first_at AT TIME ZONE 'UTC', last_at AT TIME ZONE 'UTC' FROM incoming\n"
        '  ON CONFLICT (source, event, ip, first_at) DO UPDATE SET attempts = EXCLUDED.attempts, detail = EXCLUDED.detail, last_at = EXCLUDED.last_at;\n'
        "DELETE FROM security_events WHERE last_at < CURRENT_TIMESTAMP - INTERVAL '90 days';\n"
        "SELECT 'security_events: ' || count(*) || ' rows, last ' || COALESCE(max(last_at)::text, '-') FROM security_events;\n"
    )
    psql = os.environ.get('SECURITY_EXPORT_PSQL', 'docker exec -i aykdmh-db psql -U aykdmh -d aykdmh').split()
    result = subprocess.run(psql + ['-v', 'ON_ERROR_STOP=1', '-q', '-At'],
                            input=sql, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        sys.exit(1)
    os.makedirs(STATE, exist_ok=True)
    open(f'{STATE}/done', 'w').close()
    print(f'exported {len(rows)} rows ({SINCE}); {result.stdout.strip()}')


if __name__ == '__main__':
    main()
