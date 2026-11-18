#!/usr/bin/env node
// «أي خدمة» simulator: a small local web page (AYK-250).
//   node simulator/sim.js            then open http://127.0.0.1:4600
// "ابدأ المحاكاة" starts a run on an isolated copy of the app (see engine.js); everything that
// happens streams to the page live. Results are kept in simulator/runs/ (not in Git); what was
// fixed for each finding is recorded in simulator/fixes.json and shown under its tab.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { runSimulation } = require('./engine');

const PORT = Number(process.env.SIM_PORT || 4600);
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

async function start({ providers, clients, bulk, together, rush }) {
  current = { events: [], startedAt: Date.now() };
  emit({ type: 'start', providers, clients, bulk, together, rush });
  try {
    const summary = await runSimulation({ providers, clients, bulk, together, rush, emit });
    fs.writeFileSync(path.join(RUNS, `${summary.startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(summary, null, 1));
  } catch (err) {
    emit({ type: 'done', summary: { fatal: err.message, findings: [], passes: {}, speed: { table: [], stall: {} } } });
  } finally { current = null; }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
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
    if (current) return json(409, { message: 'محاكاة تعمل الآن' });
    const providers = Math.min(1000, Math.max(2, Number(url.searchParams.get('providers')) || 10));
    const clients = Math.min(1000, Math.max(2, Number(url.searchParams.get('clients')) || 10));
    const bulk = Math.min(200000, Math.max(0, Number(url.searchParams.get('bulk')) || 0));
    const together = Math.min(providers + clients, Math.max(1, Number(url.searchParams.get('together')) || Math.min(20, providers + clients)));
    const rush = Math.min(50000, Math.max(0, Number(url.searchParams.get('rush')) || 0));
    start({ providers, clients, bulk, together, rush });
    return json(202, { started: true, providers, clients, bulk, together, rush });
  }
  if (req.method === 'GET' && url.pathname === '/runs') return json(200, runsList());
  if (req.method === 'GET' && url.pathname === '/run') {
    const file = path.basename(url.searchParams.get('file') || '');
    return /^[\w-]+\.json$/.test(file) && fs.existsSync(path.join(RUNS, file)) ? json(200, readJson(path.join(RUNS, file), {})) : json(404, {});
  }
  if (req.method === 'GET' && url.pathname === '/fixes') return json(200, readJson(FIXES, []));
  return json(404, { message: 'غير موجود' });
}).listen(PORT, process.env.SIM_HOST || '127.0.0.1', () => console.log(`محاكي «أي خدمة» يعمل: http://127.0.0.1:${PORT}`));
