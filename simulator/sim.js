#!/usr/bin/env node
// «أي خدمة» simulator: a small local web page (AYK-250).
//   node simulator/sim.js            then open http://127.0.0.1:4600
// "ابدأ المحاكاة" starts a run on an isolated copy of the app (see engine.js); everything that
// happens streams to the page live. Results are kept in simulator/runs/ (not in Git); what was
// fixed for each finding is recorded in simulator/fixes.json and shown under its tab.
//
// On a server (deploy/install-simulator.sh) the page is reached from outside, so it is locked:
//   SIM_PASSWORD      required whenever SIM_HOST is not this machine only; asked by the browser (any user name)
//   SIM_TRUST_PROXY=1 the gateway's X-Forwarded-For is the visitor's address (for the wrong-password lock)
//   SIM_MAX_PEOPLE / SIM_MAX_BULK / SIM_MAX_RUSH / SIM_MAX_WORKERS   ceilings, so a run cannot starve the server
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runSimulation } = require('./engine');

const PORT = Number(process.env.SIM_PORT || 4600);
const HOST = process.env.SIM_HOST || '127.0.0.1';
const PASSWORD = process.env.SIM_PASSWORD || '';
const LOCAL_ONLY = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
if (!LOCAL_ONLY && PASSWORD.length < 8) {
  console.error('SIM_PASSWORD (8 characters or more) is required when the simulator listens beyond this machine.');
  process.exit(1);
}
const cap = (name, fallback) => { const n = Number(process.env[name]); return Number.isFinite(n) && n >= 0 ? n : fallback; };
const MAX = { people: cap('SIM_MAX_PEOPLE', 1000), bulk: cap('SIM_MAX_BULK', 200000), rush: cap('SIM_MAX_RUSH', 50000), workers: Math.max(1, cap('SIM_MAX_WORKERS', 16)) };

// Wrong passwords: 5 from one address lock it for 15 minutes; 40 in an hour from anywhere lock
// everyone for an hour (a guesser who changes addresses). A right password never unlocks early.
const WRONG_PER_ADDRESS = 5, ADDRESS_LOCK_MS = 15 * 60e3, WRONG_TOTAL = 40, TOTAL_WINDOW_MS = 60 * 60e3;
const wrong = new Map(); // address -> { count, until }
let wrongTotal = [];
const digest = text => crypto.createHash('sha256').update(String(text)).digest();
const PASSWORD_DIGEST = digest(PASSWORD);
function addressOf(req) {
  const forwarded = process.env.SIM_TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
  return forwarded || req.socket.remoteAddress || '';
}
// true = let in; otherwise the response has been sent.
function allowed(req, res) {
  if (!PASSWORD) return true;
  const deny = (status, message, extra = {}) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(message); return false; };
  const now = Date.now(), address = addressOf(req);
  wrongTotal = wrongTotal.filter(at => now - at < TOTAL_WINDOW_MS);
  const entry = wrong.get(address);
  if (entry && entry.until <= now && entry.count >= WRONG_PER_ADDRESS) wrong.delete(address);
  if (wrongTotal.length >= WRONG_TOTAL || (wrong.get(address)?.until > now)) return deny(429, 'محاولات خاطئة كثيرة. حاول لاحقًا.', { 'Retry-After': '900' });
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return deny(401, 'كلمة المرور مطلوبة', { 'WWW-Authenticate': 'Basic realm="simulator", charset="UTF-8"' });
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);
  if (crypto.timingSafeEqual(digest(given), PASSWORD_DIGEST)) return true;
  const next = { count: (wrong.get(address)?.count || 0) + 1, until: 0 };
  if (next.count >= WRONG_PER_ADDRESS) next.until = now + ADDRESS_LOCK_MS;
  if (wrong.size > 5000) wrong.clear();
  wrong.set(address, next);
  wrongTotal.push(now);
  return deny(401, 'كلمة المرور غير صحيحة', { 'WWW-Authenticate': 'Basic realm="simulator", charset="UTF-8"' });
}
const RUNS = path.join(__dirname, 'runs');
const FIXES = path.join(__dirname, 'fixes.json');
fs.mkdirSync(RUNS, { recursive: true });

const listeners = new Set();
let current = null; // { events: [], startedAt }
const send = (res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
function emit(event) {
  if (current && event.type !== 'vitals') current.events.push(event);
  for (const res of listeners) send(res, event);
}
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } };
const runsList = () => fs.readdirSync(RUNS).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30)
  .map(f => { const r = readJson(path.join(RUNS, f), {}); return { file: f, startedAt: r.startedAt, providers: r.providers, clients: r.clients, seconds: r.seconds, findings: (r.findings || []).length, mode: r.mode, crowd: r.crowd?.accounts || 0 }; });

async function start({ providers, clients, bulk, together, rush, workers }) {
  current = { events: [], startedAt: Date.now() };
  emit({ type: 'start', providers, clients, bulk, together, rush });
  try {
    const summary = await runSimulation({ providers, clients, bulk, together, rush, workers, emit });
    fs.writeFileSync(path.join(RUNS, `${summary.startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(summary, null, 1));
  } catch (err) {
    emit({ type: 'done', summary: { fatal: err.message, findings: [], passes: {}, speed: { table: [], stall: {} } } });
  } finally { current = null; }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!allowed(req, res)) return undefined;
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    send(res, { type: 'hello', running: Boolean(current) });
    if (current) for (const event of current.events) send(res, event); // a page opened mid-run catches up
    listeners.add(res);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => { clearInterval(beat); listeners.delete(res); });
    return undefined;
  }
  if (req.method === 'POST' && url.pathname === '/start') {
    // A browser sends a saved password to this page from any site: only this page's own button may start a run.
    const origin = req.headers.origin;
    if (req.headers['sec-fetch-site'] ? !['same-origin', 'none'].includes(req.headers['sec-fetch-site']) : (origin && new URL(origin).host !== req.headers.host)) return json(403, { message: 'مرفوض' });
    if (current) return json(409, { message: 'محاكاة تعمل الآن' });
    const providers = Math.min(MAX.people, Math.max(2, Number(url.searchParams.get('providers')) || 10));
    const clients = Math.min(MAX.people, Math.max(2, Number(url.searchParams.get('clients')) || 10));
    const bulk = Math.min(MAX.bulk, Math.max(0, Number(url.searchParams.get('bulk')) || 0));
    const together = Math.min(providers + clients, Math.max(1, Number(url.searchParams.get('together')) || Math.min(20, providers + clients)));
    const rush = Math.min(MAX.rush, Math.max(0, Number(url.searchParams.get('rush')) || 0));
    const workers = Math.min(MAX.workers, Math.max(1, Number(url.searchParams.get('workers')) || 1));
    start({ providers, clients, bulk, together, rush, workers });
    return json(202, { started: true, providers, clients, bulk, together, rush, workers });
  }
  if (req.method === 'GET' && url.pathname === '/runs') return json(200, runsList());
  if (req.method === 'GET' && url.pathname === '/run') {
    const file = path.basename(url.searchParams.get('file') || '');
    return /^[\w-]+\.json$/.test(file) && fs.existsSync(path.join(RUNS, file)) ? json(200, readJson(path.join(RUNS, file), {})) : json(404, {});
  }
  if (req.method === 'GET' && url.pathname === '/limits') return json(200, MAX);
  if (req.method === 'GET' && url.pathname === '/fixes') return json(200, readJson(FIXES, []));
  return json(404, { message: 'غير موجود' });
}).listen(PORT, HOST, () => console.log(`محاكي «أي خدمة» يعمل: http://${HOST}:${PORT}${PASSWORD ? ' (بكلمة مرور)' : ''}`));
