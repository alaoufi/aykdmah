// The waiting room (AYK-272, the owner's request): when more requests arrive at once than this
// server copy can work on well, the extra ones wait in line, first come first served, instead of
// all of them slowing down together. Each waits at most ADMISSION_MAX_WAIT_MS; if the line itself
// is full, or the wait runs out, the answer is 503 "busy" with Retry-After, and the app tries again.
// What happens is counted (served, waited, longest line, refused) for the simulator and the admin.
//   ADMISSION_MAX_ACTIVE   requests worked on at the same time (default: 4 x the database pool)
//   ADMISSION_MAX_WAITING  longest line before refusing (default 5000)
//   ADMISSION_MAX_WAIT_MS  longest wait in line (default 20000)
// Per server copy: with APP_WORKERS=N each copy has its own line.
const num = (value, fallback) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; };

function createAdmission({
  maxActive = num(process.env.ADMISSION_MAX_ACTIVE, 4 * num(process.env.DB_POOL_MAX, 10)),
  maxWaiting = num(process.env.ADMISSION_MAX_WAITING, 5000),
  maxWaitMs = num(process.env.ADMISSION_MAX_WAIT_MS, 20000),
  exempt = path => path === '/health' || path.startsWith('/health/'),
} = {}) {
  let active = 0;
  let line = [], head = 0; // a queue: line[head..] are waiting
  const stats = { since: new Date().toISOString(), served: 0, waited: 0, refused: 0, timedOut: 0, longestLine: 0, longestWaitMs: 0, totalWaitMs: 0 };
  const waiting = () => line.length - head;

  const busy = (req, res, why) => {
    if (res.headersSent || res.writableEnded) return;
    res.setHeader('Retry-After', '2');
    res.status(503).json({ success: false, code: 'busy_queue', reason: why, retry_after: 2, message: req.t ? req.t('busy_queue') : 'Busy, please retry' });
  };
  function start(req, res, next) {
    active += 1;
    let released = false;
    const release = () => { if (released) return; released = true; active -= 1; stats.served += 1; drain(); };
    res.on('finish', release);
    res.on('close', release);
    next();
  }
  function drain() {
    while (active < maxActive && waiting() > 0) {
      const entry = line[head]; line[head] = undefined; head += 1;
      if (head > 1024 && head * 2 > line.length) { line = line.slice(head); head = 0; }
      if (entry.gone) continue;
      clearTimeout(entry.timer);
      const waitedMs = Date.now() - entry.at;
      stats.totalWaitMs += waitedMs;
      if (waitedMs > stats.longestWaitMs) stats.longestWaitMs = waitedMs;
      entry.res.setHeader('X-Queue-Wait-Ms', String(waitedMs));
      start(entry.req, entry.res, entry.next);
    }
  }

  function middleware(req, res, next) {
    if (exempt(req.path)) return next();
    if (active < maxActive && waiting() === 0) return start(req, res, next);
    if (waiting() >= maxWaiting) { stats.refused += 1; return busy(req, res, 'line_full'); }
    const entry = { req, res, next, at: Date.now(), gone: false };
    entry.timer = setTimeout(() => { if (entry.gone) return; entry.gone = true; stats.timedOut += 1; busy(req, res, 'wait_too_long'); }, maxWaitMs);
    entry.timer.unref?.();
    res.on('close', () => { if (!entry.gone && !res.headersSent) { entry.gone = true; clearTimeout(entry.timer); } });
    line.push(entry);
    stats.waited += 1;
    if (waiting() > stats.longestLine) stats.longestLine = waiting();
    return undefined;
  }

  function snapshot() {
    return {
      active, waiting: waiting(), max_active: maxActive, max_waiting: maxWaiting, max_wait_ms: maxWaitMs,
      served: stats.served, waited: stats.waited, refused: stats.refused, timed_out: stats.timedOut,
      longest_line: stats.longestLine, longest_wait_ms: stats.longestWaitMs,
      average_wait_ms: stats.waited ? Math.round(stats.totalWaitMs / Math.max(1, stats.waited - stats.timedOut)) : 0,
      since: stats.since, pid: process.pid,
    };
  }
  return { middleware, snapshot };
}

const shared = createAdmission();
module.exports = { createAdmission, admission: shared.middleware, admissionStats: shared.snapshot };
