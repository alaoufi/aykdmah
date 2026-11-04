#!/usr/bin/python3
"""Mandatory real subscription canary before enabling a new server worker image."""
import hashlib
import os
import secrets
import tempfile
import uuid
from pathlib import Path
import bridge

def main():
    if not bridge.check_login() or not os.path.ismount(bridge.TASKS):
        raise SystemExit('Sign in to ChatGPT and mount the bounded task disk first.')
    verified = bridge.BASE/'verified-isolation'
    verified.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(dir=bridge.TASKS,prefix='canary-') as tmp:
        base=Path(tmp)
        work,ipc=base/'workspace',base/'ipc'
        for path in (work,ipc):
            path.mkdir(mode=0o700)
            os.chown(path,bridge.UID,bridge.UID)
        nonce=secrets.token_hex(24)
        (work/'marker').write_text(nonce)
        (work/'sum.cjs').write_text('module.exports=(a,b)=>a-b;\n')
        (work/'check.cjs').write_text("require('node:assert/strict').equal(require('./sum.cjs')(2,3),5);\n")
        for path in work.iterdir():
            os.chown(path,bridge.UID,bridge.UID)
            path.chmod(0o600)
        bridge.run([bridge.DOCKER,'run','--rm','--network=none',*bridge.FLAGS,'-v',str(work)+':/workspace',
                    bridge.IMAGE,'sh','-ec','git init -q -b probe && git config user.name Smoke && git config user.email probe@localhost.invalid && git add . && git commit -qm baseline && ! node check.cjs'],
                   timeout=30, check=True)
        job=dict(id=str(uuid.uuid4()))
        reply=bridge.turn(job,work,ipc,True,'Use shell in /workspace. Read marker and return exactly its contents. '
                          'First verify /auth, /data, /var/run/docker.sock are absent and /sys/class/net lists only lo. '
                          'Attempt to create /workspace/forbidden and require read-only failure. If any check fails return FAIL.')
        if reply!=nonce or (work/'forbidden').exists():
            raise SystemExit('Read-only or tool routing isolation test failed.')
        bridge.turn(job,work,ipc,False,'In /workspace use apply_patch to correct sum.cjs from subtraction to addition. '
                    'Then run the shell command node check.cjs && sha256sum marker > receipt. '
                    'Only after the shell check passes, commit the fixture and the change on a disposable test branch. '
                    'Report the test result; do not network or read any other directory.')
        # Never read untrusted files/links as root. Verify all evidence with a
        # fresh, credential-free, network-disabled, resource-limited container.
        expected=hashlib.sha256(nonce.encode()).hexdigest()
        r=bridge.run([bridge.DOCKER,'run','--rm','--network=none',*bridge.FLAGS,'-v',str(work)+':/workspace:ro',
                      bridge.IMAGE,'sh','-ec','test "$(cut -d " " -f1 receipt)" = "$1" && test ! -e /auth && test ! -e /data && test ! -e /var/run/docker.sock && test "$(ls /sys/class/net)" = lo && '
                      '''node -e "const a=require('node:assert/strict'),sum=require('./sum.cjs');a.equal(sum(2,3),5);a.equal(sum(-2,1),-1);" && '''
                      'git diff --exit-code HEAD^ HEAD -- check.cjs && git diff --exit-code HEAD -- sum.cjs && ! git diff --quiet HEAD^ HEAD -- sum.cjs',
                      'verify',expected],timeout=25)
        if r.returncode:
            raise SystemExit('Remote patch, shell receipt, commit or independent check failed.')
    verified.write_text(bridge.signature()+'\n')
    print('PASS: isolated worker enabled for this exact image and configuration.')

if __name__=='__main__':
    main()
