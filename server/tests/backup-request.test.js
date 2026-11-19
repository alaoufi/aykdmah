// «Take a backup now» (AYK-304): the API only leaves a request file in the shared folder; the server
// runs the backup. These check when a request is accepted or refused, and what the page is told.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const backupRequest = require('../services/backupRequest');

const MIN = 60e3;
let dir;
const writeStatus = value => fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(value));
const iso = ms => new Date(ms).toISOString();

test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayk-backup-req-'));
  process.env.BACKUP_REQUESTS_DIR = dir;
});
test.afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.BACKUP_REQUESTS_DIR; });

test('without the shared folder the button is unavailable and nothing is written', () => {
  process.env.BACKUP_REQUESTS_DIR = path.join(dir, 'missing');
  assert.deepEqual(backupRequest.state(), { available: false });
  assert.deepEqual(backupRequest.request(1), { ok: false, reason: 'unavailable' });
  delete process.env.BACKUP_REQUESTS_DIR;
  assert.equal(backupRequest.state().available, false);
});

test('a request leaves only the request file, and a second one waits for it', () => {
  const now = Date.now();
  assert.deepEqual(backupRequest.request(7, now), { ok: true });
  assert.deepEqual(fs.readdirSync(dir), ['now']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'now'), 'utf8')).by, 7);
  const s = backupRequest.state(now);
  assert.equal(s.pending, true);
  assert.equal(s.stuck, false);
  assert.deepEqual(backupRequest.request(7, now), { ok: false, reason: 'pending' });
});

test('a request nobody picked up for 10 minutes is shown as stuck and can be sent again', () => {
  const now = Date.now();
  backupRequest.request(1, now);
  const later = now + backupRequest._internal.PENDING_STALE_MS + MIN;
  assert.equal(backupRequest.state(later).stuck, true);
  assert.deepEqual(backupRequest.request(1, later), { ok: true });
});

test('a running backup refuses a new request; a run with no news for 3 hours counts as dead', () => {
  const now = Date.now();
  writeStatus({ state: 'running', step: 'media', trigger: 'timer', started: iso(now - 5 * MIN), updated: iso(now - MIN) });
  const s = backupRequest.state(now);
  assert.equal(s.running, true);
  assert.equal(s.last.step, 'media');
  assert.deepEqual(backupRequest.request(1, now), { ok: false, reason: 'running' });
  writeStatus({ state: 'running', step: 'media', started: iso(now - 4 * 3600e3), updated: iso(now - 4 * 3600e3) });
  assert.equal(backupRequest.state(now).running, false);
  assert.deepEqual(backupRequest.request(1, now), { ok: true });
});

test('at most one manual backup every 10 minutes after the last one finished', () => {
  const now = Date.now();
  writeStatus({ state: 'done', step: 'finished', trigger: 'manual', started: iso(now - 6 * MIN), updated: iso(now - 4 * MIN), finished: iso(now - 4 * MIN), backup: 'aykdmh-x-manual.tar.enc' });
  const refused = backupRequest.request(1, now);
  assert.equal(refused.reason, 'too_soon');
  assert.equal(refused.wait_seconds, 6 * 60);
  assert.equal(backupRequest.state(now).last.backup, 'aykdmh-x-manual.tar.enc');
  assert.deepEqual(backupRequest.request(1, now + 7 * MIN), { ok: true });
});

test('a damaged status file is ignored', () => {
  fs.writeFileSync(path.join(dir, 'status.json'), '{not json');
  assert.equal(backupRequest.state().last, null);
  assert.deepEqual(backupRequest.request(1), { ok: true });
});
