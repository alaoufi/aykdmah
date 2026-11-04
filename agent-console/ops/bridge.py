#!/usr/bin/python3
"""One systemd socket-activated request. Only this trusted broker uses Docker."""
import hashlib
import json
import re
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

BASE = Path('/opt/private-agent-console/worker')
TASKS = BASE / 'tasks'
IMAGE = 'private-agent-cli:0.147.0'
UID = 31072
DOCKER = '/usr/bin/docker'
FLAGS = ['--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
         '--pids-limit=128', '--memory=600m', '--memory-swap=600m', '--cpus=0.7',
         '--log-driver=none', '--user=31072:31072', '--tmpfs=/tmp:rw,nosuid,nodev,size=96m']
FEATURES_OFF = ('apps', 'plugins', 'remote_plugin', 'hooks', 'computer_use', 'browser_use',
                'multi_agent', 'image_generation', 'workspace_dependencies', 'skill_search',
                'skill_mcp_dependency_install', 'memories', 'tool_suggest', 'view_image')

def run(args, timeout=30, **kw):
    return subprocess.run(args, timeout=timeout, stderr=subprocess.DEVNULL, **kw)

def pause(message):
    return dict(status='blocked', retrySafe=True, message=message)

def check_login():
    proc = subprocess.run(
        [str(BASE / 'subscription'), 'status'], stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, timeout=40)
    return proc.returncode == 0 and proc.stdout.strip() == b'Logged in using ChatGPT'

class UsageLimit(RuntimeError):
    pass

def signature():
    digest = hashlib.sha256()
    for artifact in ('bridge.py','relay.cjs','quota.cjs','verify-isolation.py','subscription'):
        digest.update((BASE/artifact).read_bytes())
    digest.update(subprocess.check_output([DOCKER,'image','inspect','--format={{.Id}}',IMAGE]))
    return digest.hexdigest()

def turn(job, task, ipc, readonly, prompt):
    tag = 'private-agent-' + job['id']
    runner, client = tag + '-tools', tag + '-client'
    mounts = ['-v', str(BASE / 'relay.cjs') + ':/relay.cjs:ro',
              '-v', str(BASE / 'quota.cjs') + ':/quota.cjs:ro', '-v', str(ipc) + ':/ipc']
    task_mount = str(task) + ':/workspace' + (':ro' if readonly else '')
    cli = ['-a','never','exec','--ignore-user-config','--ignore-rules','--ephemeral',
           '--json','--skip-git-repo-check','--sandbox','danger-full-access','-C','/workspace',
           '-c','forced_login_method="chatgpt"','-c','model_provider="openai"',
           '-c','web_search="disabled"', '-c','model_reasoning_effort="low"',
           '-o','/tmp/reply']
    for name in FEATURES_OFF:
        cli.extend(['--disable', name])
    try:
        run([DOCKER,'run','-d','--rm','--network=none','--name',runner,*FLAGS,*mounts,
             '-v',task_mount,IMAGE,'node','/relay.cjs','tools'], stdout=subprocess.DEVNULL,check=True)
        # Wait for the socket and the listener before dispatching inference.
        for _ in range(30):
            if (ipc/'exec.sock').is_socket():
                probe = run([DOCKER,'exec',runner,'node','-e',
                             "const s=require('net').connect(18765,'127.0.0.1',()=>s.end());s.on('error',()=>process.exit(1));"],
                            stdout=subprocess.DEVNULL)
                if probe.returncode == 0:
                    break
            time.sleep(0.25)
        else:
            raise RuntimeError('Tool environment unavailable')
        # Only the client can contact OpenAI. Model-facing tools resolve exclusively
        # to the external exec-server (pinned Codex 0.147). No local fallback.
        proc = run([DOCKER,'run','--rm','-i','--name',client,*FLAGS,*mounts,
                    '-e','CODEX_EXEC_SERVER_URL=ws://127.0.0.1:18765','-e','CODEX_HOME=/auth',
                    '-v',str(BASE/'auth')+':/auth',IMAGE,'sh','-c',
                    'timeout -k 5 345 node /relay.cjs client "$@" >/dev/null && head -c 12000 /tmp/reply','cli',*cli,'-'],
                   input=prompt.encode(), stdout=subprocess.PIPE, timeout=360)
        if proc.returncode == 75:
            raise UsageLimit()
        if proc.returncode or not proc.stdout.strip():
            raise RuntimeError('No verified CLI reply; inspect checkpoint, quota and login')
        return proc.stdout.decode('utf8', errors='replace').strip()
    finally:
        run([DOCKER,'rm','-f',client,runner], stdout=subprocess.DEVNULL)
        (ipc/'exec.sock').unlink(missing_ok=True)

def handle(job):
    identifier = job['id']
    if str(uuid.UUID(identifier)) != identifier or job['project'] not in ('aykdmah','trbhh'):
        raise ValueError('Invalid task')
    for field in ('text','acceptance'):
        if not isinstance(job.get(field), str) or not 0 < len(job[field].strip()) <= 10000:
            return dict(status='needs-clarification',message='يلزم تحديد الطلب ومعايير القبول والاختبار.')
    if not check_login():
        return pause('يلزم تسجيل الدخول إلى Codex بحساب ChatGPT على الخادم.')
    marker = BASE / 'verified-isolation'
    if not marker.is_file() or marker.read_text().strip() != signature():
        return pause('يلزم اجتياز اختبار عزل Codex بعد تسجيل الدخول على الخادم.')
    seed = BASE / 'reviewed-seeds' / (job['project'] + '.git')
    if not seed.is_dir() or not os.path.ismount(TASKS):
        return pause('بيئة العمل المعزولة أو نسخة المشروع غير جاهزة.')
    screen = run(['/usr/bin/python3',str(BASE/'screen-seed.py'),str(seed)], timeout=45, stdout=subprocess.DEVNULL)
    if screen.returncode:
        return pause('تحتاج نسخة المشروع إلى مراجعة ملفات حساسة قبل إتاحتها للوكيل.')
    task = TASKS / identifier
    upstream,snapshot=(seed.parent/(job['project']+'.source')).read_text().splitlines()
    if not all(re.fullmatch(r'[0-9a-f]{40}',sha) for sha in (upstream,snapshot)):
        raise ValueError('Invalid source checkpoint')
    ledger = BASE/'checkpoints'
    ledger.mkdir(mode=0o700,exist_ok=True)
    checkpoint=ledger/(identifier+'.json')
    can_replan=ledger/(identifier+'.readonly')
    identity=dict(project=job['project'],upstream=upstream,snapshot=snapshot)
    fresh=not task.exists()
    if fresh:
        task.mkdir(mode=0o700)
        with checkpoint.open('x') as entry:
            json.dump(identity,entry)
        os.chown(task, UID, UID)
    elif can_replan.is_file() and json.loads(checkpoint.read_text())==identity:
        can_replan.unlink()  # consume before another dispatch
    else:
        return dict(status='needs-verification',message='توجد نسخة عمل سابقة. راجعها قبل أي استئناف.',checkpoint=identifier)
    with tempfile.TemporaryDirectory(dir=TASKS, prefix='ipc-') as temp:
        ipc = Path(temp)
        os.chown(ipc, UID, UID)
        try:
            # Source mirror is read-only. All Git hooks/config and clone writes
            # run in a non-root container with no network or credentials.
            if fresh:
                clone = run([DOCKER,'run','--rm','--network=none',*FLAGS,
                         '-v',str(task)+':/workspace','-v',str(seed)+':/seed:ro',IMAGE,'sh','-ec',
                         'git -c safe.directory=/seed -c core.hooksPath=/dev/null clone --no-local --depth=1 --single-branch /seed . && '
                         'test "$(git rev-parse HEAD)" = "$2" && git remote remove origin && git config core.hooksPath /dev/null && git switch -c "task/$1" && '
                         'git config user.email agent@localhost.invalid && git config user.name Agent',
                         'seed',identifier,snapshot],timeout=100,stdout=subprocess.DEVNULL)
                if clone.returncode:
                    raise RuntimeError('Project checkout unavailable')
            request = 'Project: '+job['project']+'\nRequest: '+job['text']+'\nAcceptance and tests: '+job['acceptance']
            plan = turn(job,task,ipc,True,'Inspect the existing project instructions, branches, current code and tests in /workspace. '
                        'Workspace is mounted read only for this review. Identify exact existing files and functions and acceptance tests. '
                        'If materially ambiguous or missing evidence start reply with CLARIFY and a focused Arabic question. '
                        'Otherwise start with READY on a line by itself then give a concrete Arabic plan and evidence.\n'+request)
            if not plan.splitlines() or plan.splitlines()[0].strip() != 'READY':
                can_replan.touch(exist_ok=False)
                return dict(status='needs-clarification',retrySafe=True,message='تحتاج المهمة إلى توضيح قبل التعديل.',output=plan,checkpoint=identifier)
            reply = turn(job,task,ipc,False,'Implement only the approved scope after checking existing code. '
                         'Use the current task branch, run the acceptance tests and commit local changes. '
                         'Do not deploy, push, pay, publish, change DNS/accounts or access secrets. '
                         'Report actual commit, tests and limitations in Arabic.\n'+request+'\nReviewed plan:\n'+plan)
            return dict(status='needs-verification',message='انتهى تشغيل Codex. راجع التغييرات والاختبارات في نسخة المهمة.',
                        output=reply,checkpoint=identifier)
        except UsageLimit:
            return dict(status='paused-limit',message='بلغ الاشتراك حد الاستخدام. حُفظ موضع المهمة للمراجعة.',checkpoint=identifier)
        except (subprocess.SubprocessError, OSError, RuntimeError):
            return dict(status='needs-verification',message='توقف التنفيذ. افحص نسخة المهمة وتسجيل الدخول والحصة قبل المتابعة.',checkpoint=identifier)

def main():
    os.umask(0o077)
    raw = sys.stdin.buffer.readline(65537)
    if len(raw) > 65536 or not raw.endswith(b'\n'):
        raise ValueError('Invalid request')
    result = handle(json.loads(raw))
    print(json.dumps(result,ensure_ascii=False),flush=True)

if __name__ == '__main__':
    main()
