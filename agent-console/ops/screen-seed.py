#!/usr/bin/python3
"""Screen a trusted, credential-free mirror HEAD without printing paths or matched bytes."""
import re
import subprocess
import sys
from pathlib import Path

sensitive_name = re.compile(r'(^|/)(\.env($|\.(?!example$|sample$|template$|test$|development\.example$))|credentials\.json$|auth\.json$|id_(rsa|ed25519)$|[^/]+\.(p12|pfx|jks|keystore|mobileprovision)$)', re.I)
secret = re.compile(rb'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|gh[pors]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{65,}|sk-(?:proj-|ant-)[A-Za-z0-9_\-]{28,}|AKIA[A-Z0-9]{16}')
def scan(seed):
    git = ['git','-c','safe.directory='+str(seed),'-C',str(seed)]
    entries = subprocess.check_output(git+['ls-tree','-r','-z','HEAD']).split(b'\0')
    count = 0
    process = subprocess.Popen(git+['cat-file','--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for entry in entries:
            if not entry:
                continue
            meta,path = entry.split(b'\t',1)
            mode,kind,oid = meta.split()
            if kind != b'blob':
                continue
            count += 1
            if sensitive_name.search(path.decode(errors='replace')):
                return False,count
            process.stdin.write(oid+b'\n')
            process.stdin.flush()
            size = int(process.stdout.readline().split()[2])
            tail = b''
            while size:
                block = process.stdout.read(min(65536,size))
                if not block or secret.search(tail+block):
                    return False,count
                tail = block[-256:]
                size -= len(block)
            if process.stdout.read(1) != b'\n':
                raise RuntimeError('Invalid Git object stream')
        return True,count
    finally:
        process.stdin.close()
        process.kill()
        process.wait()

if __name__=='__main__':
    seed = Path(sys.argv[1]).resolve()
    ok,count=scan(seed)
    print('PASS' if ok else 'HOLD', count)
    sys.exit(0 if ok else 1)
