#!/usr/bin/python3
"""Create a new parentless, screened snapshot. No source history or excluded blobs are copied."""
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('screen',Path(__file__).with_name('screen-seed.py'))
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)
BASE = Path('/opt/private-agent-console/worker')
SKIP_DIRS = {'.ssh','.gnupg','.aws','.azure','.kube','.codex','.claude','node_modules','backups','secrets','.git'}
BANNED_EXT = {'.p8','.pem','.key','.cer','.crt','.p7b','.p12','.pfx','.jks','.keystore','.der',
              '.apk','.aab','.ipa','.zip','.gz','.tgz','.tar','.xz','.rar','.7z','.bak','.db','.sqlite',
              '.sql.gz','.dump','.env','.ovpn','.kdbx','.asc','.pkcs12','.mobileprovision'}
secret_values = re.compile(rb'(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^$<>\s/@]{5,}@|(?:xox[baprs]-|sk_live_|rk_live_)[A-Za-z0-9-]{10,}')

def excluded(name):
    path = Path(name.lower())
    if any(p in SKIP_DIRS for p in path.parts) or path.suffix in BANNED_EXT or path.name.startswith('.env'):
        return True
    return bool(screen.sensitive_name.search(name) or re.search(r'(?:credential|service[-_]?account|google-services\.json|googleService-info\.plist|\.npmrc$|\.netrc$|keychain|\.tfstate|secret\.json$)',name,re.I))

def git(repo,*args,**kw):
    return subprocess.check_output(['git','-c','safe.directory='+str(repo),'-C',str(repo),*args],**kw)

def generate(project):
    if project not in ('aykdmah','trbhh'):
        raise ValueError('Unknown project')
    src=BASE/'seeds'/(project+'.git')
    reviewed=BASE/'reviewed-seeds'
    reviewed.mkdir(mode=0o700,exist_ok=True)
    target=reviewed/(project+'.git')
    if target.exists():
        raise ValueError('Review and archive existing snapshot before replacing it')
    head=git(src,'rev-parse','HEAD').decode().strip()
    with tempfile.TemporaryDirectory(dir=reviewed) as tmp:
        clean=Path(tmp)/'repo'
        subprocess.run(['git','init','--bare','--quiet','--initial-branch=reviewed',str(clean)],check=True)
        records=[]
        skipped=0
        blobs=subprocess.Popen(['git','-C',str(src),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
        try:
            entries=git(src,'ls-tree','-rlz',head).split(b'\0')
            for entry in entries:
                if not entry: continue
                meta,name=entry.split(b'\t',1)
                mode,kind,oid,size=meta.split()
                if mode not in (b'100644',b'100755') or kind!=b'blob' or int(size)>2*1024*1024 or excluded(os.fsdecode(name)):
                    skipped+=1
                    continue
                blobs.stdin.write(oid+b'\n')
                blobs.stdin.flush()
                length=int(blobs.stdout.readline().split()[2])
                buf=blobs.stdout.read(length)
                assert blobs.stdout.read(1)==b'\n'
                if b'\0' in buf or screen.secret.search(buf) or secret_values.search(buf):
                    skipped+=1
                    continue
                if git(clean,'hash-object','-w','--stdin',input=buf).strip()!=oid:
                    raise RuntimeError('Blob verification failed')
                records.append(mode+b' '+oid+b'\t'+name+b'\0')
        finally:
            blobs.stdin.close()
            blobs.kill()
            blobs.wait()
        git(clean,'update-index','-z','--index-info',input=b''.join(records))
        tree=git(clean,'write-tree').decode().strip()
        commit=git(clean,'-c','user.name=Agent Seed','-c','user.email=seed@localhost.invalid','commit-tree',tree,
                   input=b'Screened source snapshot\n').decode().strip()
        git(clean,'update-ref','refs/heads/reviewed',commit)
        (clean/'index').unlink()
        git(clean,'fsck','--full','--strict')
        if not screen.scan(clean)[0]: raise ValueError('Snapshot scanner blocked output')
        for path in [clean,*clean.rglob('*')]:
            os.chown(path,0,31072)
            path.chmod(0o750 if path.is_dir() else 0o640)
        (reviewed/(project+'.source')).write_text(head+'\n'+commit+'\n')
        os.rename(clean,target)
        print(project,head,commit,'allowed',len(records),'excluded',skipped)
if __name__=='__main__':
    generate(sys.argv[1])
