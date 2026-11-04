'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openQueue } = require('../queue.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-queue-'));
  const connections = [];
  t.after(() => {
    connections.forEach(q => q.close());
    fs.rmSync(dir, { recursive: true, force: true });
  });
  function open() {
    const q = openQueue(dir);
    connections.push(q);
    return q;
  }
  return { dir, open };
}
const task = (overrides = {}) => ({
  id: randomUUID(), project: 'aykdmah', agent: 'auto', text: 'review a local test',
  acceptance: 'return a test result', ...overrides,
});

test('reconnect retries are idempotent across new connections and fenced on changed payload', t => {
  const { open } = fixture(t);
  const one = open(), two = open(), job = task();
  assert.equal(one.enqueue(job), true);
  assert.equal(two.enqueue(job), false);
  assert.throws(() => two.enqueue({ ...job, text: 'different' }), { code: 'ID_CONFLICT' });
  assert.throws(() => two.enqueue({ ...job, project: 'trbhh' }), { code: 'ID_CONFLICT' });
  assert.equal(two.jobs('aykdmah').length, 1);
  assert.equal(two.messages('aykdmah').length, 1);
  assert.deepEqual(two.messages('trbhh'), []);
});

test('transactional claims lock project and provider, while independent pairs can run', t => {
  const { open } = fixture(t);
  const first = open(), other = open();
  const a = task(), b = task({ project: 'trbhh' }), c = task({ project: 'trbhh', agent: 'claude' });
  [a, b, c].forEach(j => first.enqueue(j));
  const run = first.claim('aykdmah');
  assert.equal(run.id, a.id);
  assert.equal(run.provider, 'codex');
  assert.equal(other.claim('aykdmah'), null);
  const parallel = other.claim('trbhh');
  assert.equal(parallel.id, c.id);
  assert.equal(first.claim('trbhh'), null);
  first.finish(run, { status: 'completed', output: 'claimed success' });
  other.finish(parallel, { status: 'paused-limit', checkpoint: 'local task branch' });
  assert.equal(other.jobs('aykdmah')[0].status, 'needs-verification');
  assert.equal(other.claim('trbhh').id, b.id);
});

test('a worker process disappearing after claim quarantines both resources until reconciliation', t => {
  const { dir, open } = fixture(t);
  const q = open(), job = task();
  q.enqueue(job);
  q.enqueue(task({ project: 'trbhh' }));
  const child = spawnSync(process.execPath, ['-e', `
    const q = require(process.argv[1]).openQueue(process.argv[2]);
    process.stdout.write(JSON.stringify(q.claim('aykdmah', 100)));
    process.exit(42);
  `, require.resolve('../queue.cjs'), dir], { encoding: 'utf8' });
  assert.equal(child.status, 42, child.stderr);
  const stale = JSON.parse(child.stdout);
  assert.equal(q.claim('trbhh', 100 + 10 * 60_000), null);
  assert.equal(q.jobs('aykdmah')[0].status, 'interrupted');
  assert.equal(q.finish(stale, { status: 'needs-verification' }), false);
  assert.equal(q.renew(stale), false);
  assert.equal(q.reconcile(stale.id), true);
  assert.equal(q.claim('aykdmah'), null);
  assert.ok(q.claim('trbhh'));
});

test('legacy files migrate in one transaction with terminal precedence and no implicit replay', t => {
  const { dir, open } = fixture(t);
  fs.mkdirSync(path.join(dir, 'jobs'));
  const a = task(), b = task(), c = task({ project: 'trbhh' });
  const write = (job, state, changes) => fs.writeFileSync(path.join(dir, 'jobs', job.id + '.' + state + '.json'), JSON.stringify({ ...job, ...changes }));
  write(a, 'pending');
  write(b, 'running');
  write(c, 'running');
  write(c, 'result', { status: 'completed' });
  fs.writeFileSync(path.join(dir, 'messages.json'), JSON.stringify([{ ...a, role: 'user', date: new Date().toISOString() }]));
  const q = open();
  assert.equal(q.jobs('aykdmah').find(j => j.id === a.id).status, 'needs-clarification');
  assert.equal(q.jobs('aykdmah').find(j => j.id === b.id).status, 'interrupted');
  assert.equal(q.jobs('trbhh')[0].status, 'needs-verification');
  assert.equal(open().messages('aykdmah').length, 1);
  assert.equal(q.claim('aykdmah'), null);
});


test('independent worker processes racing on two projects cannot both claim Codex', async t => {
  const { execFile } = require('node:child_process');
  const run = require('node:util').promisify(execFile);
  const { dir, open } = fixture(t);
  const q = open();
  q.enqueue(task());
  q.enqueue(task({ project: 'trbhh' }));
  const children = await Promise.all(['aykdmah','trbhh','aykdmah','trbhh'].map(project => run(process.execPath,
    ['-e', `const q = require(process.argv[1]).openQueue(process.argv[2]);
     process.stdout.write(JSON.stringify(q.claim(process.argv[3]))); q.close();`, require.resolve('../queue.cjs'), dir, project])));
  assert.equal(children.filter(c => JSON.parse(c.stdout)).length, 1);
});

test('worker answer survives reopen and a consistent SQLite snapshot restore', async t => {
  const { processOne } = require('../worker.cjs');
  const { DatabaseSync } = require('node:sqlite');
  const { dir, open } = fixture(t);
  const q = open(), job = task();
  q.enqueue(job);
  let executed = 0;
  const execute = async request => {
    executed++;
    assert.equal(request.id, job.id);
    assert.equal(request.requested, 'codex');
    assert.equal(request.acceptance, job.acceptance);
    return { status: 'needs-verification', output: 'fixture output', message: 'test fixture', checkpoint: 'task branch' };
  };
  assert.equal(await processOne(q, job.project, execute), true);
  assert.equal(await processOne(open(), job.project, execute), false);
  assert.equal(executed, 1);
  const restore = path.join(dir, 'restored');
  fs.mkdirSync(restore, { mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'queue.sqlite'));
  try {
    db.prepare('VACUUM INTO ?').run(path.join(restore, 'queue.sqlite'));
  } finally {
    db.close();
  }
  const restored = openQueue(restore);
  try {
    assert.equal(restored.jobs(job.project)[0].checkpoint, 'task branch');
    assert.match(restored.messages(job.project)[1].text, /fixture output/);
    assert.equal(restored.claim(job.project), null);
  } finally {
    restored.close();
  }
});

test('a transaction rolls back both task and message if a conflicting legacy message already exists', t => {
  const { dir, open } = fixture(t);
  const job = task();
  fs.writeFileSync(path.join(dir, 'messages.json'), JSON.stringify([{ ...job, role: 'user', date: new Date().toISOString() }]));
  const q = open();
  assert.throws(() => q.enqueue(job));
  assert.deepEqual(q.jobs(job.project), []);
  assert.equal(q.messages(job.project).length, 1);
});


test('only fresh unclaimed requests can be clarified, with project and approval checks at transition', t => {
  const { open } = fixture(t), q = open();
  const j = task({ acceptance: '' });
  q.enqueue(j);
  assert.equal(q.claim(j.project), null);
  assert.equal(q.jobs(j.project)[0].canClarify, true);
  assert.equal(q.clarify('trbhh', j.id, 'test'), false);
  assert.equal(q.clarify(j.project, j.id, 'a passing test'), true);
  assert.equal(q.clarify(j.project, j.id, 'replacement'), false);
  assert.equal(q.enqueue(j), false); // A delayed retry of the original request.
  const claimed = q.claim(j.project);
  assert.equal(claimed.acceptance, 'a passing test');
  q.finish(claimed, { status: 'needs-clarification' });
  assert.equal(q.clarify(j.project, j.id, 'rerun'), false);
  const protectedJob = task({ acceptance: '' });
  q.enqueue(protectedJob);
  assert.equal(q.clarify(j.project, protectedJob.id, 'deploy the app'), true);
  assert.equal(q.jobs(j.project).find(t => t.id === protectedJob.id).status, 'needs-approval');
  assert.equal(q.claim(j.project), null);
});

test('manual resume preserves identity only for a confirmed pre-dispatch block', t => {
  const q = fixture(t).open(), job = task();
  q.enqueue(job);
  q.finish(q.claim(job.project), { status: 'paused', retrySafe: true });
  assert.equal(q.jobs(job.project)[0].canResume, true);
  assert.equal(q.resume(job.id, 'trbhh'), false);
  assert.equal(q.resume(job.id, job.project), true);
  assert.equal(q.resume(job.id), false);
  const run = q.claim(job.project);
  assert.equal(run.id, job.id);
  q.finish(run, { status: 'blocked' });
  assert.equal(q.resume(job.id), false);
});

test('private backup and restore retain queue, rotate sessions, block active jobs and never overwrite', t => {
  const { openAuth } = require('../auth.cjs');
  const { snapshot } = require('../backup.cjs');
  const { dir, open } = fixture(t), queue = open(), j = task();
  queue.enqueue(j);
  const auth = openAuth(path.join(dir,'web'), 'test fixture secret');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-restore-'));
  try {
    const cookie = '__Host-agent_session='+auth.issue();
    assert.ok(auth.verify(cookie));
    const backup = path.join(temp,'backup'), restore = path.join(temp,'restore');
    snapshot(dir,backup);
    assert.throws(() => snapshot(dir,backup));
    snapshot(backup,restore,true);
    const restoredAuth = openAuth(path.join(restore,'web'),'test fixture secret'), restoredQueue = openQueue(restore);
    try {
      assert.equal(restoredAuth.verify(cookie), undefined);
      assert.equal(restoredQueue.claim(j.project).id, j.id);
      assert.throws(() => snapshot(restore,path.join(temp,'active')), /in-flight/);
      assert.equal(fs.existsSync(path.join(temp,'active')), false);
    } finally { restoredAuth.close(); restoredQueue.close(); }
  } finally {
    auth.close();
    fs.rmSync(temp, {recursive:true,force:true});
  }
});


test('hourly task limit persists across connections and only counts new jobs per project', t => {
  const { open } = fixture(t), q = open();
  const j = task();
  q.enqueue(j);
  for (let i=1; i<60; i++) q.enqueue(task());
  const another = open();
  assert.throws(() => another.enqueue(task()), { code:'TASK_LIMIT' });
  assert.equal(another.enqueue(j), false);
  assert.equal(another.enqueue(task({project:'trbhh'})), true);
});
