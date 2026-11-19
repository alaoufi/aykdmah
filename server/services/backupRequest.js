// «Take a backup now» from the backups page (AYK-304). The API never runs the backup itself: it has
// no access to Docker, the code folder or the server settings. It only leaves a request file in a
// folder shared with the server (BACKUP_REQUESTS_DIR, /var/lib/aykdmh/backup-requests on the host).
// A systemd path unit (aykdmh-backup-now.path, deploy/backup-now-setup.sh) sees the file and runs
// deploy/backup.sh, the same script as the nightly backup, which writes its progress to status.json.
const fs = require('fs');
const path = require('path');

const REQUEST = 'now';
const STATUS = 'status.json';
const RUNNING_STALE_MS = 3 * 3600e3; // a "running" status older than this is a run that died
const PENDING_STALE_MS = 10 * 60e3; // a request nobody picked up in 10 minutes: the server unit is off
const MIN_GAP_MS = 10 * 60e3; // at most one manual backup every 10 minutes

const dir = () => process.env.BACKUP_REQUESTS_DIR || '';

function readStatus(base) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(base, STATUS), 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch (_) { return null; }
}

function requestedAt(base) {
  try { return fs.statSync(path.join(base, REQUEST)).mtimeMs; } catch (_) { return null; }
}

// What the page shows: whether the button can work here, a waiting request, and the last run.
function state(now = Date.now()) {
  const base = dir();
  let available = false;
  if (base) {
    try { fs.accessSync(base, fs.constants.W_OK); available = true; } catch (_) { available = false; }
  }
  if (!available) return { available: false };
  const status = readStatus(base);
  const pendingSince = requestedAt(base);
  const updated = Date.parse(status?.updated || '');
  const running = status?.state === 'running' && Number.isFinite(updated) && now - updated < RUNNING_STALE_MS;
  return {
    available: true,
    pending: pendingSince !== null,
    // The request was left but no server unit picked it up: the one-time setup is missing.
    stuck: pendingSince !== null && now - pendingSince > PENDING_STALE_MS,
    running,
    last: status ? {
      state: status.state, step: status.step || '', trigger: status.trigger || '',
      started: status.started || null, finished: status.finished || null, backup: status.backup || '',
      media: status.media || '',
    } : null,
  };
}

// Leaves the request. Returns { ok } or { ok: false, reason } with reason one of:
// unavailable, pending, running, too_soon (with wait_seconds).
function request(userId, now = Date.now()) {
  const current = state(now);
  if (!current.available) return { ok: false, reason: 'unavailable' };
  if (current.pending && !current.stuck) return { ok: false, reason: 'pending' };
  if (current.running) return { ok: false, reason: 'running' };
  const finished = Date.parse(current.last?.finished || '');
  if (Number.isFinite(finished) && now - finished < MIN_GAP_MS) {
    return { ok: false, reason: 'too_soon', wait_seconds: Math.ceil((MIN_GAP_MS - (now - finished)) / 1000) };
  }
  // The file's content is only a note: the server unit runs the same fixed script whatever it says.
  const body = JSON.stringify({ by: Number(userId) || null, at: new Date(now).toISOString() });
  fs.writeFileSync(path.join(dir(), REQUEST), body, { mode: 0o640 });
  return { ok: true };
}

module.exports = { state, request, _internal: { MIN_GAP_MS, PENDING_STALE_MS, RUNNING_STALE_MS } };
