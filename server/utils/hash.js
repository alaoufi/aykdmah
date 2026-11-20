const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

// Cost 10 (AYK-327, the owner: sign-in must be instant): a sign-in check takes about 75 ms here
// instead of about 280 ms at cost 12 (AYK-240). 10 is the lowest cost OWASP accepts for bcrypt.
// What protects an account from guessing is the lock after 5 wrong passwords, not this number;
// it only slows someone who already holds a stolen copy of the database. A hash kept at a higher
// cost is replaced at its owner's next sign-in (needsRehash).
const SALT_ROUNDS = 10;
const PREFIX = 'ayk-sha256:';
const digest = password => crypto.createHash('sha256').update(password, 'utf8').digest('base64');

// AYK-249: bcrypt (pure JavaScript) at cost 12 takes about half a second per sign-in. On the main
// thread that froze every other user's messages, calls and pages meanwhile. It now runs in a small
// pool of worker threads; the main thread stays free. If a worker cannot start, it runs inline as before.
// Up to 4 workers, always leaving one core for the main thread: 20 people signing in at the same
// instant waited 3.3 s each with 2 workers in the simulator (AYK-250).
const POOL_SIZE = Math.max(1, Math.min(4, (os.availableParallelism?.() || os.cpus().length) - 1));
const pool = [];
const pending = new Map();
let nextId = 0, nextWorker = 0, workersBroken = false;

function startWorker() {
  const worker = new Worker(path.join(__dirname, 'hashWorker.js'));
  worker.on('message', ({ id, result, error }) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (![...pending.values()].some(other => other.worker === worker)) worker.unref();
    if (error) job.reject(new Error(error)); else job.resolve(result);
  });
  worker.on('error', () => replace(worker));
  worker.on('exit', () => replace(worker));
  worker.unref(); // idle workers never keep a script or test process alive; ref'd only while working
  return worker;
}

function replace(worker) {
  const index = pool.indexOf(worker);
  if (index === -1) return;
  pool.splice(index, 1);
  // Jobs of a lost worker run inline so no sign-in hangs.
  for (const [id, job] of pending) if (job.worker === worker) { pending.delete(id); job.inline().then(job.resolve, job.reject); }
}

function run(op, a, b) {
  const inline = () => (op === 'hash' ? bcrypt.hash(a, b) : bcrypt.compare(a, b));
  if (workersBroken) return inline();
  try {
    while (pool.length < POOL_SIZE) pool.push(startWorker());
  } catch (_) {
    workersBroken = true;
    return inline();
  }
  const worker = pool[nextWorker++ % pool.length];
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, worker, inline });
    worker.ref();
    worker.postMessage({ id, op, a, b });
  });
}

async function hashPassword(password) {
  if (typeof password !== 'string' || Array.from(password).length < 4 || Array.from(password).length > 100) {
    throw new TypeError('Password must contain 4 to 100 characters');
  }
  // bcrypt consumes only the first 72 UTF-8 bytes. Prehash new passwords so
  // the entire accepted password contributes, including long Unicode input.
  return PREFIX + await run('hash', digest(password), SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string' || Buffer.byteLength(password, 'utf8') > 4096) return false;
  if (hash.startsWith(PREFIX)) return run('compare', digest(password), hash.slice(PREFIX.length));
  // Existing bcrypt credentials remain valid without modifying any account.
  return run('compare', password, hash);
}

// True for a stored hash made at a higher cost than today's: it is re-made at the next sign-in.
function needsRehash(hash) {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(String(hash || '').replace(PREFIX, ''));
  return Boolean(match) && Number(match[1]) > SALT_ROUNDS;
}

// The first sign-in after a restart paid for starting the worker threads (1.9 s measured). They are
// started and exercised once at boot instead.
function warm() {
  if (workersBroken) return Promise.resolve();
  try { while (pool.length < POOL_SIZE) pool.push(startWorker()); } catch (_) { workersBroken = true; return Promise.resolve(); }
  return Promise.all(pool.map(() => run('hash', 'warm', 4).catch(() => {})));
}

module.exports = { hashPassword, comparePassword, needsRehash, warm };
