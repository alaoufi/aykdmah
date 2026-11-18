const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

// Cost 12 (AYK-240): about four times the work of 10 for anyone guessing a stolen hash.
const SALT_ROUNDS = 12;
const PREFIX = 'ayk-sha256:';
const digest = password => crypto.createHash('sha256').update(password, 'utf8').digest('base64');

// AYK-249: bcrypt (pure JavaScript) at cost 12 takes about half a second per sign-in. On the main
// thread that froze every other user's messages, calls and pages meanwhile. It now runs in a small
// pool of worker threads; the main thread stays free. If a worker cannot start, it runs inline as before.
const POOL_SIZE = Math.max(1, Math.min(2, (os.availableParallelism?.() || os.cpus().length) - 1));
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

module.exports = { hashPassword, comparePassword };
