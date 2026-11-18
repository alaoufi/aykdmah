// «أي خدمة» simulator engine (AYK-250). One run:
// 1. creates a throw-away database (ayk_sim_*) on a LOCAL PostgreSQL and starts a private copy of
//    the app on a local port (never the live site, never real data);
// 2. signs up providers and requesters, each from its own address like real users, and drives
//    them through every path at once: requests, offers, acceptance, chat (text, image, voice,
//    live delivery), completion, reviews; then security probes, races, floods and speed;
// 3. reports every step live (emit) and files each problem under a tab:
//    gaps | speed | security | conflict | errors | flood;
// 4. stops the copy and drops the database.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(ROOT, 'server/package.json'));
const clientRequire = createRequire(path.join(ROOT, 'client/package.json'));

const PROVIDER_NAMES = ['خالد', 'فهد', 'سلطان', 'ماجد', 'تركي', 'ناصر', 'بندر', 'راشد', 'عمر', 'يوسف'];
const CLIENT_NAMES = ['نورة', 'سارة', 'أحمد', 'محمد', 'ريم', 'هند', 'عبدالله', 'منى', 'علي', 'لمى'];
const SERVICES = ['سباكة', 'كهرباء', 'تكييف', 'نجارة', 'دهان', 'تنظيف', 'نقل أثاث', 'صيانة جوالات', 'حدادة', 'تنسيق حدائق'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
function wav(seconds = 1) { // a real, silent, playable WAV
  const rate = 8000, data = Buffer.alloc(rate * seconds, 0x80), header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return results;
}

async function runSimulation({ providers = 10, clients = 10, bulk = 0, together = 0, rush = 0, workers = Number(process.env.SIM_APP_WORKERS) || 1, emit = () => {}, pg = {} } = {}) {
  const pgHost = pg.host || process.env.SIM_PG_HOST || '127.0.0.1';
  const pgPort = Number(pg.port || process.env.SIM_PG_PORT || 5432);
  const pgUser = pg.user || process.env.SIM_PG_USER || 'postgres';
  const pgPassword = pg.password ?? process.env.SIM_PG_PASSWORD ?? '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(pgHost)) throw new Error('المحاكاة تعمل على قاعدة بيانات محلية فقط');
  const dbName = `ayk_sim_${crypto.randomBytes(6).toString('hex')}`;
  const appPort = 4700 + Math.floor(Math.random() * 200);
  const base = `http://127.0.0.1:${appPort}/api`;
  const load = providers + clients > 40; // phase 2: stability under many users
  // How many people sign in at the very same instant (the rest follow in waves of the same size).
  together = Math.min(providers + clients, Math.max(1, Math.floor(Number(together) || Math.min(20, providers + clients))));
  // The rush: this many people, already signed in on their phones, open the app in the same instant.
  rush = Math.min(50000, Math.max(0, Math.floor(Number(rush) || 0)));
  bulk = Math.min(200000, Math.max(rush, Math.floor(Number(bulk) || 0))); // accounts written straight into the database
  const startedAt = Date.now();

  const findings = [];
  const passes = { gaps: 0, speed: 0, security: 0, conflict: 0, errors: 0, flood: 0 };
  const timings = new Map();
  const serverErrors = [];
  const stats = { requests: 0, failed5xx: 0, messages: 0, delivered: 0 };
  let seq = 0;

  const say = (text, extra = {}) => emit({ type: 'act', id: ++seq, at: Date.now() - startedAt, text, ...extra });
  const phase = title => emit({ type: 'phase', id: ++seq, title });
  function finding(tab, severity, title, detail = '') {
    const key = `${tab}:${title}`;
    const existing = findings.find(f => f.key === key);
    if (existing) { existing.count += 1; return; }
    const item = { key, tab, severity, title, detail: String(detail).slice(0, 600), count: 1 };
    findings.push(item);
    emit({ type: 'finding', id: ++seq, ...item });
  }
  // One named check: ok -> a pass in its tab; otherwise a finding.
  function check(tab, ok, title, detail = '', severity = 'متوسط') {
    if (ok) { passes[tab] += 1; emit({ type: 'pass', id: ++seq, tab, title }); } else finding(tab, severity, title, detail);
    return ok;
  }

  // ---- the private copy of the app ---------------------------------------------------------------
  const { Client } = serverRequire('pg');
  const admin = () => new Client({ host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: 'postgres', ssl: false });
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development', AUTO_MIGRATE: 'false', TRUST_PROXY: '1',
    APP_PORT: String(appPort), APP_URL: `http://127.0.0.1:${appPort}`, CLIENT_URL: `http://127.0.0.1:${appPort}`,
    DB_HOST: pgHost, DB_PORT: String(pgPort), DB_USER: pgUser, DB_PASSWORD: pgPassword, DB_NAME: dbName, DB_SSL: 'false',
    DATABASE_URL: '', DIRECT_DATABASE_URL: '', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), PAYMENT_PROVIDER: 'test',
    MAIL_HOST: '', WHATSAPP_PROVIDER: '', BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', GEOIP_DISABLE: '1',
    NO_PROXY: '127.0.0.1,localhost', ...(process.env.SIM_DB_POOL_MAX ? { DB_POOL_MAX: process.env.SIM_DB_POOL_MAX } : {}), ...(workers > 1 ? { APP_WORKERS: String(workers) } : {}),
    // Calls: rings, answers and tokens are real; no media server runs here, so no audio is carried.
    LIVEKIT_URL: 'wss://calls.sim.invalid/livekit', LIVEKIT_API_URL: '', LIVEKIT_API_KEY: 'simkey', LIVEKIT_API_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  let app = null, dbCreated = false, memoryPeakMb = 0, connectionsPeak = 0, monitor = null, prober = null, crowd = null, signIn = null, rushReport = null;
  const sockets = [];

  async function setup() {
    phase('تجهيز نسخة معزولة من الموقع');
    const client = admin();
    await client.connect();
    try {
      // A run that was interrupted (the simulator was closed mid-run) may have left its database:
      // remove every earlier simulation database nobody is connected to.
      const stale = await client.query("SELECT d.datname FROM pg_database d WHERE d.datname LIKE 'ayk\\_sim\\_%' AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)");
      for (const row of stale.rows) if (/^ayk_sim_[a-f0-9]{12}$/.test(row.datname)) await client.query(`DROP DATABASE IF EXISTS "${row.datname}"`);
      if (stale.rows.length) say(`حُذفت ${stale.rows.length} قاعدة تجريبية قديمة من محاكاة لم تكتمل`, { actor: 'النظام' });
      await client.query(`CREATE DATABASE "${dbName}"`); dbCreated = true;
    } finally { await client.end(); }
    say('أُنشئت قاعدة بيانات مؤقتة للمحاكاة', { actor: 'النظام' });
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', "require('./server/services/installService').setupFromEnv().then(r=>{const e=r.migrations.flatMap(m=>m.errors);if(e.length){console.error(e.join('; '));process.exit(1)}process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"], { cwd: ROOT, env });
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`فشل تجهيز القاعدة: ${err.slice(-400)}`))));
    });
    say('طُبّقت كل الترحيلات على القاعدة المؤقتة', { actor: 'النظام' });
    app = spawn(process.execPath, [...(process.env.SIM_PROFILE ? ['--cpu-prof', `--cpu-prof-dir=${process.env.SIM_PROFILE}`] : []), 'server/server.js'], { cwd: ROOT, env });
    const onLog = data => {
      for (const line of String(data).split('\n')) {
        if (/TypeError|ReferenceError|RangeError|SyntaxError|UnhandledPromiseRejection|ECONNREFUSED|deadlock|too many clients|out of memory/i.test(line)) serverErrors.push(line.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 300));
      }
    };
    app.stdout.on('data', onLog);
    app.stderr.on('data', onLog);
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch (_) { /* not up yet */ }
      await sleep(250);
      if (i === 79) throw new Error('نسخة الموقع لم تبدأ');
    }
    say('نسخة الموقع المعزولة تعمل', { actor: 'النظام' });
    // Server memory and database connections, sampled during the whole run.
    monitor = setInterval(async () => {
      try {
        const rss = Number(require('node:fs').readFileSync(`/proc/${app.pid}/statm`, 'utf8').split(' ')[1]) * 4096 / 1048576;
        memoryPeakMb = Math.max(memoryPeakMb, Math.round(rss));
      } catch (_) { /* not Linux */ }
      try {
        const c = admin(); await c.connect();
        const r = await c.query('SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1', [dbName]);
        connectionsPeak = Math.max(connectionsPeak, r.rows[0].n); await c.end();
      } catch (_) { /* skip a sample */ }
      emit({ type: 'vitals', memoryMb: memoryPeakMb, connections: connectionsPeak, requests: stats.requests });
    }, 1500);
    // A tiny request every 100 ms: how long the server "freezes" for everyone while busy.
    const stalls = [];
    prober = { stalls, timer: setInterval(async () => {
      const t = Date.now();
      try { await fetch(`${base}/health`, { headers: { 'X-Forwarded-For': `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } }); stalls.push(Date.now() - t); } catch (_) { stalls.push(5000); }
    }, 100) };
  }

  async function teardown() {
    clearInterval(monitor);
    if (prober) clearInterval(prober.timer);
    for (const s of sockets) { try { s.disconnect(); } catch (_) { /* closed */ } }
    if (app) { app.kill(process.env.SIM_PROFILE ? 'SIGINT' : 'SIGTERM'); await sleep(process.env.SIM_PROFILE ? 3000 : 400); if (app.exitCode === null) app.kill('SIGKILL'); }
    if (dbCreated) {
      const client = admin();
      try { await client.connect(); await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`); } catch (_) { /* reported below */ } finally { await client.end().catch(() => {}); }
    }
  }

  // ---- tens of thousands of accounts, with their requests and offers ------------------------------
  // Written straight into the throw-away database in seconds (signing each one up through the site
  // would take hours: every password is hashed slowly on purpose). The live people then work on
  // top of this crowd, so slow searches and missing indexes show up as they would on a busy site.
  async function seedCrowd() {
    if (!bulk) return;
    phase(`تجهيز ${bulk.toLocaleString('en')} حساب آلي مع طلباتهم وعروضهم`);
    const half = Math.floor(bulk / 2);
    const db = new Client({ host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: dbName, ssl: false });
    await db.connect();
    const t = Date.now();
    try {
      await db.query(`INSERT INTO users (full_name, email, password_hash, role)
        SELECT 'مزود آلي ' || g, 'crowd_p' || g || '@sim.invalid', 'crowd-account-cannot-sign-in', 'provider' FROM generate_series(1, $1) g`, [half]);
      await db.query(`INSERT INTO users (full_name, email, password_hash, role)
        SELECT 'عميل آلي ' || g, 'crowd_c' || g || '@sim.invalid', 'crowd-account-cannot-sign-in', 'client' FROM generate_series(1, $1) g`, [half]);
      say(`${bulk.toLocaleString('en')} حساب آلي أُنشئ`, { actor: 'النظام', ms: Date.now() - t });
      const made = await db.query(`INSERT INTO requests (client_id, title, description, status, latitude, longitude, address)
        SELECT u.id, 'طلب آلي ' || u.id, 'طلب من الحشد الآلي لقياس السرعة مع بيانات كثيرة', 'open',
               26.2 + random() * 0.3, 43.8 + random() * 0.4, 'بريدة'
        FROM users u WHERE u.email LIKE 'crowd_c%'`);
      // Two offers on every crowd request, from two different crowd providers.
      await db.query(`WITH p AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS n FROM users WHERE email LIKE 'crowd_p%'),
          r AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS n FROM requests WHERE title LIKE 'طلب آلي%')
        INSERT INTO offers (request_id, provider_id, price, message, status)
        SELECT r.id, p.id, 50 + (r.n % 400), 'عرض آلي', 'pending'
        FROM r CROSS JOIN generate_series(0, 1) k JOIN p ON p.n = (r.n + k * 7) % $1`, [half]);
      await db.query('ANALYZE');
      const size = await db.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS size, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM requests) AS requests, (SELECT COUNT(*) FROM offers) AS offers');
      crowd = { accounts: bulk, requests: made.rowCount, offers: Number(size.rows[0].offers), databaseSize: size.rows[0].size, seconds: Math.round((Date.now() - t) / 1000) };
      say(`قاعدة البيانات الآن: ${Number(size.rows[0].users).toLocaleString('en')} حساب، ${Number(size.rows[0].requests).toLocaleString('en')} طلب، ${Number(size.rows[0].offers).toLocaleString('en')} عرض (${size.rows[0].size})`, { actor: 'النظام', ms: Date.now() - t });
    } catch (err) {
      finding('errors', 'خطير', 'تعذر تجهيز الحسابات الآلية', err.message);
    } finally { await db.end().catch(() => {}); }
  }

  // ---- the rush: tens of thousands open the app at the same instant -------------------------------
  // People stay signed in for a year, so opening the app does not hash a password: it restores the
  // saved session and loads the first screen. Each crowd account gets a valid session (signed with
  // this copy's own key) and, all at once, does what the app does on opening: who am I, settings,
  // categories, my list, unread count. A share of them also opens the live connection.
  async function theRush() {
    if (!rush) return;
    phase(`الاندفاع: ${rush.toLocaleString('en')} مستخدم يفتحون التطبيق في اللحظة نفسها`);
    const jwt = serverRequire('jsonwebtoken');
    const db = new Client({ host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: dbName, ssl: false });
    await db.connect();
    const rows = (await db.query("SELECT id, role FROM users WHERE email LIKE 'crowd\\_%' ORDER BY id LIMIT $1", [rush])).rows;
    await db.end();
    const crowdPeople = rows.map((row, i) => ({
      id: row.id, role: row.role, ip: `11.${Math.floor(i / 62500) % 250}.${Math.floor(i / 250) % 250}.${(i % 250) + 1}`,
      token: jwt.sign({ id: row.id, role: row.role, auth_version: 0, scope: 'site', sv: 0 }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }),
    }));
    const statuses = {}, durations = [], perRoute = {};
    let failedPeople = 0, done = 0;
    const openApp = async person => {
      const t = Date.now();
      const headers = { Authorization: `Bearer ${person.token}`, 'X-Forwarded-For': person.ip, 'Accept-Language': 'ar' };
      const routes = ['/auth/me', '/settings/public', '/categories', person.role === 'provider' ? '/requests/nearby?latitude=26.33&longitude=43.98&radius=20&limit=12' : '/requests/my', '/chat/unread'];
      let ok = true;
      await Promise.all(routes.map(async route => {
        let status = 0;
        const started = Date.now();
        try { const r = await fetch(base + route, { headers }); status = r.status; await r.arrayBuffer(); } catch (_) { /* refused or reset */ }
        const name = route.split('?')[0];
        (perRoute[name] ||= []).push(Date.now() - started);
        statuses[status] = (statuses[status] || 0) + 1;
        stats.requests += 1;
        if (status !== 200) ok = false;
      }));
      durations.push(Date.now() - t);
      if (!ok) failedPeople += 1;
      if (++done % Math.max(500, Math.floor(rush / 10)) === 0) say(`${done.toLocaleString('en')} من ${rush.toLocaleString('en')} فتحوا التطبيق`, { actor: 'النظام' });
    };
    const before = prober.stalls.length;
    const transactions = async () => { const c = admin(); try { await c.connect(); return Number((await c.query('SELECT xact_commit + xact_rollback AS n FROM pg_stat_database WHERE datname = $1', [dbName])).rows[0].n); } catch (_) { return 0; } finally { await c.end().catch(() => {}); } };
    const txBefore = await transactions();
    // CPU seconds used by the app copy (all its threads) and by this simulator during the rush:
    // if the simulator itself is the busy one, the numbers measure it, not the site.
    const fsx = require('node:fs');
    const cpuOf = pid => { try { const f = fsx.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / 100; } catch (_) { return 0; } };
    const copies = () => { try { return fsx.readFileSync(`/proc/${app.pid}/task/${app.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean); } catch (_) { return []; } };
    const serverCpu = () => cpuOf(app.pid) + copies().reduce((sum, pid) => sum + cpuOf(pid), 0);
    const cpu0 = { server: serverCpu(), sim: process.cpuUsage() };
    const t0 = Date.now();
    await Promise.all(crowdPeople.map(openApp));
    const seconds = (Date.now() - t0) / 1000;
    const simCpu = process.cpuUsage(cpu0.sim);
    const cpu = { serverSeconds: Number((serverCpu() - cpu0.server).toFixed(1)), simulatorSeconds: Number(((simCpu.user + simCpu.system) / 1e6).toFixed(1)) };
    await sleep(600); // statistics are flushed a moment later
    const queriesPerRequest = Number(((await transactions() - txBefore) / (rush * 5)).toFixed(1));
    // Live connections: a share of the crowd connects at once and must all be accepted.
    const { io } = clientRequire('socket.io-client');
    const liveTarget = Math.min(rush, 3000);
    let live = 0;
    const tLive = Date.now();
    await inBatches(crowdPeople.slice(0, liveTarget), 500, person => new Promise(resolve => {
      const socket = io(`http://127.0.0.1:${appPort}`, { auth: { token: person.token, lang: 'ar' }, transports: ['websocket'], reconnection: false, extraHeaders: { 'X-Forwarded-For': person.ip } });
      sockets.push(socket);
      socket.on('connect', () => { live += 1; resolve(); });
      socket.on('connect_error', () => resolve());
      setTimeout(resolve, 15000);
    }));
    const liveSeconds = (Date.now() - tLive) / 1000;
    await sleep(500);
    const sorted = durations.sort((x, y) => x - y);
    const stalls = prober.stalls.slice(before).sort((x, y) => x - y);
    rushReport = {
      people: rush, seconds: Number(seconds.toFixed(1)), requests: rush * 5, queriesPerRequest, cpu, perSecond: Math.round(rush * 5 / seconds),
      failedPeople, statuses, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), maxMs: sorted[sorted.length - 1] || 0,
      routes: Object.fromEntries(Object.entries(perRoute).map(([k, v]) => { v.sort((x, y) => x - y); return [k, { medianMs: percentile(v, 0.5), p95Ms: percentile(v, 0.95) }]; })),
      live, liveTarget, liveSeconds: Number(liveSeconds.toFixed(1)), memoryMb: memoryPeakMb, stallMaxMs: stalls[stalls.length - 1] || 0,
    };
    say(`انتهى الاندفاع: ${rush.toLocaleString('en')} فتحوا التطبيق خلال ${rushReport.seconds} ثانية (${rushReport.perSecond.toLocaleString('en')} طلب في الثانية)`, { actor: 'النظام', bad: failedPeople > 0 });
    const histogram = Object.entries(statuses).map(([k, v]) => `${k === '0' ? 'انقطاع' : k}×${v.toLocaleString('en')}`).join('، ');
    check('errors', failedPeople === 0, `الاندفاع: كل الـ ${rush.toLocaleString('en')} فتحوا التطبيق بنجاح`, `${failedPeople.toLocaleString('en')} مستخدم لم تكتمل شاشته الأولى؛ ردود الخادم: ${histogram}`, 'خطير');
    check('speed', rushReport.p95Ms <= 5000, 'الاندفاع: الشاشة الأولى تفتح خلال 5 ثوانٍ لـ 95٪ من المستخدمين', `الوسيط ${rushReport.medianMs}ms، أبطأ 5٪ ${rushReport.p95Ms}ms، الأقصى ${rushReport.maxMs}ms`, rushReport.p95Ms > 15000 ? 'خطير' : 'متوسط');
    check('errors', live === liveTarget, `الاندفاع: ${liveTarget.toLocaleString('en')} اتصالًا حيًّا فُتحت كلها`, `فُتح ${live.toLocaleString('en')} من ${liveTarget.toLocaleString('en')} خلال ${rushReport.liveSeconds} ثانية`, 'خطير');
    for (const s of sockets.splice(0)) { try { s.disconnect(); } catch (_) { /* closed */ } }
    await sleep(1000);
  }

  // ---- one HTTP call as one simulated person ----------------------------------------------------
  async function call(label, route, { actor, method = 'GET', body, form, token, lang = 'ar', ip, raw = false, quiet = false } = {}) {
    const headers = { 'Accept-Language': lang, 'X-Forwarded-For': ip || actor?.ip || '10.0.0.1' };
    const bearer = token === undefined ? actor?.token : token;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = typeof body === 'string' ? body : JSON.stringify(body); }
    const t = Date.now();
    let status = 0, json = null, text = '';
    try {
      const response = await fetch(base + route, { method, headers, body: payload, redirect: 'manual' });
      status = response.status;
      text = await response.text();
      try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
      if (raw) json = { ...(json || {}), _headers: Object.fromEntries(response.headers) };
    } catch (err) { text = err.message; }
    const ms = Date.now() - t;
    stats.requests += 1;
    if (!quiet) { if (!timings.has(label)) timings.set(label, []); timings.get(label).push(ms); }
    if (status >= 500 || status === 0) {
      stats.failed5xx += 1;
      finding('errors', 'خطير', `خطأ خادم (${status || 'انقطاع'}) في: ${label}`, `${method} ${route} → ${text.slice(0, 200)}`);
    }
    return { status, data: json?.data, message: json?.message, json, ms, text };
  }

  // ---- people -----------------------------------------------------------------------------------
  const people = [];
  function makePeople() {
    const make = (role, i) => {
      const names = role === 'provider' ? PROVIDER_NAMES : CLIENT_NAMES;
      const name = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');
      return { role, name, label: `${role === 'provider' ? 'المزود' : 'العميل'} ${name}`, username: `sim_${role[0]}${i}_${crypto.randomBytes(3).toString('hex')}`,
        password: `Sim-${crypto.randomBytes(6).toString('hex')}`, ip: `10.${role === 'provider' ? 1 : 2}.${Math.floor(i / 250)}.${(i % 250) + 1}`, received: [] };
    };
    for (let i = 0; i < providers; i++) people.push(make('provider', i));
    for (let i = 0; i < clients; i++) people.push(make('client', i));
    emit({ type: 'people', people: people.map(p => ({ label: p.label, role: p.role })) });
  }
  const P = () => people.filter(p => p.role === 'provider');
  const C = () => people.filter(p => p.role === 'client');

  async function signUp() {
    phase(`تسجيل ${providers} مقدم خدمة و${clients} طالب خدمة`);
    await inBatches(people, load ? 20 : 5, async person => {
      const r = await call('إنشاء حساب', '/auth/register', { actor: person, method: 'POST', token: null, body: { full_name: person.name, username: person.username, password: person.password, role: person.role } });
      if (r.status === 201 && r.data?.token) { person.token = r.data.token; person.id = r.data.user.id; say(`${person.label} أنشأ حسابه`, { actor: person.label, ms: r.ms }); }
      else finding('errors', 'خطير', 'فشل إنشاء حساب', `${person.label}: ${r.status} ${r.message || ''}`);
    });
    const alive = people.filter(p => p.token);
    check('errors', alive.length === people.length, 'كل الحسابات أُنشئت', `${alive.length} من ${people.length}`, 'خطير');
    // Sign-in: everyone, `together` people at the very same instant, wave after wave.
    phase(`تسجيل الدخول: ${alive.length} مستخدمًا، ${together} في اللحظة نفسها`);
    const waves = [];
    await inBatches(alive, together, async person => {
      const r = await call('تسجيل الدخول', '/auth/login', { actor: person, method: 'POST', token: null, body: { identifier: person.username, password: person.password } });
      waves.push(r.ms);
      if (r.status === 200 && r.data?.token) { person.token = r.data.token; if (alive.length <= 60 || alive.indexOf(person) % 10 === 0) say(`${person.label} سجّل دخوله`, { actor: person.label, ms: r.ms }); }
      else finding('errors', 'خطير', 'فشل تسجيل الدخول بكلمة مرور صحيحة', `${person.label}: ${r.status} ${r.message || ''}`);
    });
    signIn = { together, people: alive.length, slowestMs: Math.max(0, ...waves), averageMs: Math.round(waves.reduce((x, y) => x + y, 0) / Math.max(1, waves.length)) };
    say(`دخل ${alive.length} مستخدمًا، كل ${together} معًا: المتوسط ${signIn.averageMs}ms والأبطأ ${signIn.slowestMs}ms`, { actor: 'النظام' });
    const me = await call('بياناتي', '/auth/me', { actor: alive[0] });
    check('errors', me.status === 200 && Number(me.data?.user?.id) === Number(alive[0].id), 'الجلسة تعيد بيانات صاحبها');
    check('security', !JSON.stringify(me.json || {}).includes('password_hash'), 'بيانات الحساب لا تكشف كلمة المرور المشفرة', '', 'خطير');
  }

  // ---- live connections -------------------------------------------------------------------------
  async function connectSockets() {
    phase('فتح الاتصال الحي (الرسائل الفورية)');
    const { io } = clientRequire('socket.io-client');
    const targets = load ? people.filter(p => p.token).slice(0, 60) : people.filter(p => p.token);
    await inBatches(targets, 20, person => new Promise(resolve => {
      const socket = io(`http://127.0.0.1:${appPort}`, { auth: { token: person.token, lang: 'ar' }, transports: ['websocket'], reconnection: false, extraHeaders: { 'X-Forwarded-For': person.ip } });
      sockets.push(socket);
      person.socket = socket;
      socket.on('chat:message', message => person.received.push({ id: message.id, at: Date.now() }));
      socket.on('connect', resolve);
      socket.on('connect_error', err => { finding('errors', 'متوسط', 'تعذر فتح الاتصال الحي', `${person.label}: ${err.message}`); resolve(); });
      setTimeout(resolve, 6000);
    }));
    const connected = targets.filter(p => p.socket?.connected).length;
    check('errors', connected === targets.length, 'الاتصال الحي فُتح لكل المستخدمين', `${connected} من ${targets.length}`);
    say(`${connected} مستخدمًا متصلون الآن مباشرة`, { actor: 'النظام' });
  }

  // ---- the marketplace: requests, offers, acceptance ---------------------------------------------
  const jobs = [];
  async function marketplace() {
    phase('طالبو الخدمة ينشرون طلباتهم');
    await inBatches(C().filter(p => p.token), load ? 25 : 5, async (client, i) => {
      const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
      const r = await call('إنشاء طلب', '/requests', { actor: client, method: 'POST', body: { title: `أحتاج ${service}`, description: `طلب ${service} في بريدة، في أقرب وقت`, address: 'بريدة', latitude: 26.326 + Math.random() * 0.02, longitude: 43.975 + Math.random() * 0.02 } });
      if (r.status === 201 && r.data?.id) { jobs.push({ client, requestId: r.data.id, service, offers: [] }); say(`${client.label} طلب «${service}»`, { actor: client.label, ms: r.ms }); }
      else finding('errors', 'خطير', 'فشل إنشاء طلب', `${client.label}: ${r.status} ${r.message || ''}`);
    });
    const nearby = await call('الطلبات القريبة', '/requests/nearby?latitude=26.33&longitude=43.98&radius=10&limit=50', { actor: P()[0] });
    check('errors', nearby.status === 200 && Array.isArray(nearby.data), 'المزود يرى الطلبات القريبة');
    check('gaps', nearby.status !== 200 || (nearby.data || []).length > 0, 'الطلبات الجديدة تظهر للمزودين القريبين', `ظهر ${nearby.data?.length ?? 0}`);

    phase('مقدمو الخدمة يرسلون عروضهم');
    const active = P().filter(p => p.token);
    await inBatches(jobs, load ? 25 : 5, async (job, j) => {
      const bidders = [active[j % active.length], active[(j + 1) % active.length], active[(j + 3) % active.length]].filter((p, i, a) => p && a.indexOf(p) === i);
      await Promise.all(bidders.map(async provider => {
        const price = 80 + Math.floor(Math.random() * 300);
        const r = await call('إرسال عرض', '/offers', { actor: provider, method: 'POST', body: { request_id: job.requestId, price, message: `أنجزها اليوم بـ ${price} ريال` } });
        if (r.status === 201 && r.data?.id) { job.offers.push({ id: r.data.id, provider, price }); say(`${provider.label} قدّم عرضًا بـ ${price} ريال لـ ${job.client.label}`, { actor: provider.label, peer: job.client.label, ms: r.ms }); }
        else finding('errors', 'متوسط', 'فشل إرسال عرض', `${provider.label}: ${r.status} ${r.message || ''}`);
      }));
    });

    phase('طالبو الخدمة يراجعون العروض ويقبلون');
    await inBatches(jobs.filter(j => j.offers.length), load ? 25 : 5, async job => {
      const list = await call('عرض العروض', `/offers/request/${job.requestId}`, { actor: job.client });
      check('errors', list.status === 200 && (list.data || []).length === job.offers.length, 'العميل يرى كل العروض المقدمة على طلبه', `${list.data?.length} من ${job.offers.length}`);
      const chosen = job.offers.reduce((a, b) => (a.price <= b.price ? a : b));
      const r = await call('قبول عرض', `/offers/${chosen.id}/accept`, { actor: job.client, method: 'PUT' });
      if (r.status === 200) { job.provider = chosen.provider; job.offerId = chosen.id; say(`${job.client.label} قبل عرض ${chosen.provider.label}`, { actor: job.client.label, peer: chosen.provider.label, ms: r.ms }); }
      else finding('errors', 'خطير', 'فشل قبول عرض', `${job.client.label}: ${r.status} ${r.message || ''}`);
    });
    const assigned = jobs.filter(j => j.provider);
    if (assigned[0]) {
      const detail = await call('تفاصيل الطلب', `/requests/${assigned[0].requestId}`, { actor: assigned[0].client });
      check('errors', detail.data?.status === 'assigned' && Number(detail.data?.assigned_provider_id) === Number(assigned[0].provider.id), 'الطلب يُسند للمزود الذي قُبل عرضه');
      const notes = await call('الإشعارات', '/notifications', { actor: assigned[0].provider });
      const count = Array.isArray(notes.data) ? notes.data.length : (notes.data?.items?.length ?? notes.data?.notifications?.length ?? 0);
      check('gaps', notes.status === 200 && count > 0, 'المزود يصله إشعار عند قبول عرضه', `الحالة ${notes.status}، عدد الإشعارات ${count}`);
    }
  }

  // ---- chat -------------------------------------------------------------------------------------
  const LINES = [['السلام عليكم، متى تقدر تجي؟', 'وعليكم السلام، اليوم بعد العصر'], ['كم تأخذ المدة؟', 'ساعة تقريبًا'], ['تمام، أرسل لك الموقع', 'ممتاز، بانتظارك']];
  async function chats() {
    phase('المحادثات: نص وصورة ورسالة صوتية بين كل عميل ومزوده');
    const pairs = jobs.filter(j => j.provider);
    await inBatches(pairs, load ? 20 : 5, async job => {
      const { client, provider } = job;
      const conv = await call('فتح محادثة', '/chat/conversations', { actor: client, method: 'POST', body: { user_id: provider.id, request_id: job.requestId } });
      if (!conv.data?.id) { finding('errors', 'خطير', 'تعذر فتح محادثة بين العميل ومزوده', `${conv.status} ${conv.message || ''}`); return; }
      job.conversationId = conv.data.id;
      job.sent = [];
      const send = async (from, to, content) => {
        const r = await call('إرسال رسالة', `/chat/conversations/${job.conversationId}/messages`, { actor: from, method: 'POST', body: { content } });
        stats.messages += 1;
        if (r.status === 201) { job.sent.push({ id: r.data.id, to }); say(`${from.label} ← ${to.label}: «${content}»`, { actor: from.label, peer: to.label, ms: r.ms, chat: true }); }
        else finding('errors', 'خطير', 'فشل إرسال رسالة نصية', `${from.label}: ${r.status} ${r.message || ''}`);
      };
      for (const [question, answer] of load ? LINES.slice(0, 1) : LINES) { await send(client, provider, question); await send(provider, client, answer); }
      if (!load || pairs.indexOf(job) < 10) {
        const image = new FormData();
        image.append('message_type', 'file'); image.append('files', new Blob([PNG], { type: 'image/png' }), 'photo.png');
        const sentImage = await call('إرسال صورة', `/chat/conversations/${job.conversationId}/messages`, { actor: client, method: 'POST', form: image });
        stats.messages += 1;
        if (sentImage.status === 201) { job.sent.push({ id: sentImage.data.id, to: provider }); job.mediaUrl = sentImage.data.files?.[0]?.file_url; say(`${client.label} أرسل صورة إلى ${provider.label}`, { actor: client.label, peer: provider.label, ms: sentImage.ms, chat: true }); }
        else finding('errors', 'خطير', 'فشل إرسال صورة في المحادثة', `${sentImage.status} ${sentImage.message || ''}`);
        const voice = new FormData();
        voice.append('message_type', 'voice'); voice.append('duration_seconds', '1'); voice.append('files', new Blob([wav()], { type: 'audio/wav' }), 'voice.wav');
        const sentVoice = await call('إرسال رسالة صوتية', `/chat/conversations/${job.conversationId}/messages`, { actor: provider, method: 'POST', form: voice });
        stats.messages += 1;
        if (sentVoice.status === 201) { job.sent.push({ id: sentVoice.data.id, to: client }); say(`${provider.label} أرسل رسالة صوتية إلى ${client.label}`, { actor: provider.label, peer: client.label, ms: sentVoice.ms, chat: true }); }
        else finding('errors', 'خطير', 'فشل إرسال رسالة صوتية', `${sentVoice.status} ${sentVoice.message || ''}`);
      }
    });
    await sleep(1500); // live deliveries settle
    let missing = 0, duplicated = 0, expected = 0;
    for (const job of pairs.filter(j => j.sent)) {
      for (const { id, to } of job.sent) {
        if (!to.socket?.connected) continue;
        expected += 1;
        const hits = to.received.filter(m => Number(m.id) === Number(id)).length;
        if (hits === 0) missing += 1; else if (hits > 1) duplicated += 1; else stats.delivered += 1;
      }
    }
    check('errors', missing === 0, 'كل رسالة وصلت للطرف الآخر فورًا', `${missing} رسالة لم تصل من ${expected}`, 'خطير');
    check('conflict', duplicated === 0, 'لا رسالة وصلت مكررة', `${duplicated} رسالة وصلت أكثر من مرة`);
    const first = pairs.find(j => j.conversationId);
    if (first) {
      const history = await call('قراءة المحادثة', `/chat/conversations/${first.conversationId}/messages`, { actor: first.provider });
      const ids = (history.data || []).map(m => Number(m.id));
      check('errors', history.status === 200 && ids.length === first.sent.length, 'سجل المحادثة كامل', `${ids.length} من ${first.sent.length}`);
      check('conflict', ids.every((id, i) => i === 0 || id > ids[i - 1]) || ids.every((id, i) => i === 0 || id < ids[i - 1]), 'الرسائل مرتبة زمنيًا');
      const unread = await call('عدد غير المقروء', '/chat/unread', { actor: first.provider });
      check('gaps', unread.status === 200, 'عداد الرسائل غير المقروءة يعمل', `الحالة ${unread.status}`);
      const read = await call('تعليم كمقروء', `/chat/conversations/${first.conversationId}/read`, { actor: first.provider, method: 'PUT' });
      check('errors', read.status === 200, 'تعليم المحادثة كمقروءة');
      if (first.mediaUrl) {
        const media = await call('فتح مرفق', first.mediaUrl.replace(/^\/api/, ''), { actor: first.provider });
        check('errors', media.status === 200 || media.status === 302, 'الطرف الآخر يفتح الصورة المرسلة', `الحالة ${media.status}`);
      }
    }
  }

  // ---- finish the jobs --------------------------------------------------------------------------
  async function completion() {
    phase('تنفيذ الطلبات وإنهاؤها والتقييم');
    await inBatches(jobs.filter(j => j.provider), load ? 25 : 5, async job => {
      const started = await call('بدء التنفيذ', `/requests/${job.requestId}/status`, { actor: job.provider, method: 'PUT', body: { status: 'in_progress' } });
      const done = await call('إنهاء الطلب', `/requests/${job.requestId}/status`, { actor: job.client, method: 'PUT', body: { status: 'completed' } });
      if (started.status !== 200 || done.status !== 200) { finding('errors', 'خطير', 'تعذر إكمال دورة الطلب', `بدء ${started.status} ${started.message || ''}، إنهاء ${done.status} ${done.message || ''}`); return; }
      job.completed = true;
      say(`${job.provider.label} أنجز «${job.service}» لـ ${job.client.label}`, { actor: job.provider.label, peer: job.client.label, ms: started.ms + done.ms });
      const stars = 3 + Math.floor(Math.random() * 3);
      const review = await call('تقييم', '/reviews', { actor: job.client, method: 'POST', body: { request_id: job.requestId, rating: stars, comment: 'عمل ممتاز وسريع' } });
      if (review.status === 201) say(`${job.client.label} قيّم ${job.provider.label} بـ ${'★'.repeat(stars)}`, { actor: job.client.label, peer: job.provider.label, ms: review.ms });
      else finding('errors', 'متوسط', 'فشل تقييم المزود بعد إنهاء الطلب', `${review.status} ${review.message || ''}`);
      const back = await call('تقييم', '/reviews', { actor: job.provider, method: 'POST', body: { request_id: job.requestId, rating: 5, comment: 'عميل محترم' } });
      if (back.status !== 201) finding('errors', 'متوسط', 'فشل تقييم العميل من المزود', `${back.status} ${back.message || ''}`);
    });
    const finished = jobs.find(j => j.completed);
    if (finished) {
      const rating = await call('تقييمات المزود', `/reviews/user/${finished.provider.id}/stats`, { actor: finished.client });
      check('gaps', rating.status === 200, 'ملخص تقييمات المزود يظهر', `الحالة ${rating.status}`);
      const wallet = await call('المحفظة', '/wallet', { actor: finished.provider });
      check('gaps', wallet.status === 200, 'صفحة المحفظة تفتح للمزود', `الحالة ${wallet.status}`);
    }
  }

  // ---- security: everyone tries what is not theirs ------------------------------------------------
  async function security() {
    phase('الأمان: كل مستخدم يحاول الوصول لما ليس له');
    const job = jobs.find(j => j.conversationId && j.provider);
    const intruder = people.find(p => p.token && p !== job?.client && p !== job?.provider);
    if (!job || !intruder) { finding('security', 'ملاحظة', 'لم تكتمل بيانات كافية لفحوص الأمان'); return; }
    const mark = (ok, title, detail) => { check('security', ok, title, detail, 'خطير'); say(`${intruder.label} حاول: ${title} → ${ok ? 'مُنع ✓' : 'نجح ✗'}`, { actor: intruder.label, bad: !ok }); };
    let r = await call('اختراق: قراءة محادثة غيره', `/chat/conversations/${job.conversationId}/messages`, { actor: intruder, quiet: true });
    mark([403, 404].includes(r.status), 'قراءة محادثة ليست له', `الحالة ${r.status}`);
    r = await call('اختراق: الكتابة في محادثة غيره', `/chat/conversations/${job.conversationId}/messages`, { actor: intruder, method: 'POST', body: { content: 'تطفل' }, quiet: true });
    mark([403, 404].includes(r.status), 'الكتابة في محادثة ليست له', `الحالة ${r.status}`);
    if (job.mediaUrl) {
      r = await call('اختراق: مرفق غيره', job.mediaUrl.replace(/^\/api/, ''), { actor: intruder, quiet: true });
      mark([403, 404].includes(r.status), 'فتح صورة من محادثة ليست له', `الحالة ${r.status}`);
      r = await call('اختراق: مرفق بلا دخول', job.mediaUrl.replace(/^\/api/, ''), { token: null, ip: '10.9.9.1', quiet: true });
      mark([401, 403, 404].includes(r.status), 'فتح مرفق خاص بلا تسجيل دخول', `الحالة ${r.status}`);
    }
    r = await call('اختراق: عروض طلب غيره', `/offers/request/${job.requestId}`, { actor: intruder, quiet: true });
    mark(r.status !== 200 || (r.data || []).every(o => Number(o.provider_id) === Number(intruder.id)), 'رؤية عروض المنافسين على طلب ليس له', `الحالة ${r.status}، عروض ${r.data?.length ?? 0}`);
    const open = jobs.find(j => j.offers.length && !j.provider) || job;
    r = await call('اختراق: قبول عرض', `/offers/${open.offers[0].id}/accept`, { actor: intruder, method: 'PUT', quiet: true });
    mark([400, 403, 404, 409].includes(r.status), 'قبول عرض على طلب ليس له', `الحالة ${r.status}`);
    r = await call('اختراق: تغيير حالة طلب', `/requests/${job.requestId}/status`, { actor: intruder, method: 'PUT', body: { status: 'cancelled' }, quiet: true });
    mark([400, 403, 404].includes(r.status), 'تغيير حالة طلب ليس له', `الحالة ${r.status}`);
    r = await call('اختراق: حذف طلب', `/requests/${job.requestId}`, { actor: intruder, method: 'DELETE', quiet: true });
    mark([400, 403, 404].includes(r.status), 'حذف طلب ليس له', `الحالة ${r.status}`);
    r = await call('اختراق: تعديل حساب غيره', `/users/${job.client.id}`, { actor: intruder, method: 'PUT', body: { full_name: 'مخترق', role: 'admin' }, quiet: true });
    mark([401, 403, 404].includes(r.status), 'تعديل حساب مستخدم آخر', `الحالة ${r.status}`);
    r = await call('اختراق: ترقية نفسه', '/users/me', { actor: intruder, method: 'PUT', body: { role: 'admin', is_super_admin: true, is_verified: 1 }, quiet: true });
    const after = await call('بياناتي', '/auth/me', { actor: intruder, quiet: true });
    mark(after.data?.user?.role !== 'admin' && !after.data?.user?.is_super_admin, 'ترقية نفسه إلى مدير عبر تعديل الملف الشخصي', `الدور بعد المحاولة: ${after.data?.user?.role}`);
    for (const [route, title] of [['/admin/dashboard', 'لوحة الإدارة'], ['/admin/settings', 'إعدادات الإدارة'], ['/admin/security-report', 'تقرير الأمان'], ['/users', 'قائمة كل المستخدمين'], ['/wallet/admin', 'محافظ كل المستخدمين']]) {
      r = await call(`اختراق: ${title}`, route, { actor: intruder, quiet: true });
      mark([401, 403].includes(r.status), `فتح ${title} بحساب عادي`, `الحالة ${r.status}`);
    }
    r = await call('اختراق: بلا دخول', '/chat/conversations', { token: null, ip: '10.9.9.2', quiet: true });
    mark(r.status === 401, 'قراءة المحادثات بلا تسجيل دخول', `الحالة ${r.status}`);
    const forged = `${intruder.token.split('.').slice(0, 2).join('.')}.${Buffer.from('forged').toString('base64url')}`;
    r = await call('اختراق: رمز مزور', '/auth/me', { token: forged, ip: '10.9.9.3', quiet: true });
    mark(r.status === 401, 'الدخول برمز جلسة مزوّر', `الحالة ${r.status}`);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: job.client.id, role: 'admin' })).toString('base64url')}.`;
    r = await call('اختراق: رمز بلا توقيع', '/auth/me', { token: none, ip: '10.9.9.3', quiet: true });
    mark(r.status === 401, 'الدخول برمز بلا توقيع (alg none)', `الحالة ${r.status}`);
    r = await call('اختراق: حقن في البحث', `/chat/conversations/${job.conversationId}/search?q=${encodeURIComponent("' OR 1=1 --")}`, { actor: job.client, quiet: true });
    mark(r.status < 500, 'حقن SQL في البحث لا يكسر الخادم', `الحالة ${r.status}`);
    r = await call('اختراق: تقييم طلب غيره', '/reviews', { actor: intruder, method: 'POST', body: { request_id: job.requestId, rating: 1, comment: 'تقييم مزيف' }, quiet: true });
    mark([400, 403, 404].includes(r.status), 'تقييم طلب لم يشارك فيه', `الحالة ${r.status}`);
    // A requester assigns a provider who never took part, completes alone, and tries to review them.
    const victim = P().find(p => p.token && p !== job.provider);
    const liar = C().find(p => p.token && p !== job.client);
    if (victim && liar) {
      const direct = await call('اختراق: طلب مباشر', '/requests/direct', { actor: liar, method: 'POST', body: { provider_id: victim.id }, quiet: true });
      const directId = direct.data?.request_id || direct.data?.id;
      if (directId) {
        await call('اختراق: اعتماد', `/requests/${directId}/agree`, { actor: liar, method: 'POST', body: { provider_id: victim.id }, quiet: true });
        await call('اختراق: إنهاء منفرد', `/requests/${directId}/status`, { actor: liar, method: 'PUT', body: { status: 'completed' }, quiet: true });
        r = await call('اختراق: تقييم مزيف', '/reviews', { actor: liar, method: 'POST', body: { request_id: directId, rating: 1, comment: 'تقييم كيدي' }, quiet: true });
        check('security', r.status !== 201, 'تقييم مزود لم يشارك في الطلب إطلاقًا (تقييم كيدي)', `الحالة ${r.status}`, 'خطير');
        say(`${liar.label} حاول تقييم ${victim.label} دون أن يتعامل معه → ${r.status !== 201 ? 'مُنع ✓' : 'نجح ✗'}`, { actor: liar.label, peer: victim.label, bad: r.status === 201 });
      }
    }
    r = await call('اختراق: ملف تنفيذي', `/chat/conversations/${job.conversationId}/messages`, { actor: job.client, method: 'POST', quiet: true, form: (() => { const f = new FormData(); f.append('message_type', 'file'); f.append('files', new Blob([Buffer.from('MZ\x90\x00binary')], { type: 'image/png' }), 'virus.png'); return f; })() });
    mark(r.status === 400, 'رفع ملف تنفيذي متنكر في صورة', `الحالة ${r.status}`);
    r = await call('اختراق: رسالة ضخمة', `/chat/conversations/${job.conversationId}/messages`, { actor: job.client, method: 'POST', body: { content: 'ا'.repeat(20000) }, quiet: true });
    mark(r.status === 400 || r.status === 413, 'إرسال رسالة أطول من الحد', `الحالة ${r.status}`);
    r = await call('رؤوس الحماية', '/health', { raw: true, ip: '10.9.9.4', quiet: true });
    const h = r.json?._headers || {};
    check('security', Boolean(h['x-content-type-options']) && Boolean(h['content-security-policy']), 'رؤوس الحماية (CSP وnosniff) موجودة في ردود الخادم', Object.keys(h).join(','));
    check('security', !h['x-powered-by'], 'الخادم لا يعلن نوع برنامجه (X-Powered-By)');
  }

  // ---- conflicts: two people do the same thing at the same instant --------------------------------
  async function conflicts() {
    phase('التعارض: شخصان يفعلان الشيء نفسه في اللحظة نفسها');
    const client = C().find(p => p.token), [a, b] = P().filter(p => p.token);
    if (!client || !a || !b) return;
    const twice = async (title, make, expectOne) => {
      const results = await Promise.all([make(0), make(1)]);
      const ok = results.filter(r => r.status >= 200 && r.status < 300).length;
      check('conflict', ok === expectOne && results.every(r => r.status < 500), title, `نجح ${ok} من 2 (المتوقع ${expectOne})؛ الحالات: ${results.map(r => r.status).join('، ')}`, 'خطير');
      say(`تعارض: ${title} → نجح ${ok} من 2`, { actor: 'النظام', bad: ok !== expectOne });
      return results;
    };
    const username = `sim_dup_${crypto.randomBytes(3).toString('hex')}`;
    await twice('اسم المستخدم نفسه يُسجَّل مرتين في اللحظة نفسها: واحد فقط ينجح', i => call('تعارض: تسجيل', '/auth/register', { ip: `10.8.0.${i + 1}`, token: null, method: 'POST', quiet: true, body: { full_name: 'مكرر', username, password: 'Sim-dup-123456', role: 'client' } }), 1);
    const req = await call('إنشاء طلب', '/requests', { actor: client, method: 'POST', quiet: true, body: { title: 'طلب التعارض', description: 'اختبار قبول عرضين معًا', latitude: 26.33, longitude: 43.98 } });
    const o1 = await call('إرسال عرض', '/offers', { actor: a, method: 'POST', quiet: true, body: { request_id: req.data?.id, price: 100, message: 'عرض أ' } });
    const o2 = await call('إرسال عرض', '/offers', { actor: b, method: 'POST', quiet: true, body: { request_id: req.data?.id, price: 110, message: 'عرض ب' } });
    await twice('المزود نفسه يرسل عرضين على الطلب نفسه معًا: لا يتكرر عرضه', () => call('تعارض: عرض مكرر', '/offers', { actor: a, method: 'POST', quiet: true, body: { request_id: req.data?.id, price: 90, message: 'عرض مكرر' } }), 0);
    if (o1.data?.id && o2.data?.id) {
      await twice('العميل يقبل عرضين مختلفين في اللحظة نفسها: واحد فقط يُقبل', i => call('تعارض: قبول عرضين', `/offers/${[o1, o2][i].data.id}/accept`, { actor: client, method: 'PUT', quiet: true }), 1);
      const state = await call('تفاصيل الطلب', `/requests/${req.data.id}`, { actor: client, quiet: true });
      check('conflict', state.data?.status === 'assigned' && Boolean(state.data?.assigned_provider_id), 'الطلب بعد التعارض مسند لمزود واحد', `الحالة ${state.data?.status}`);
      const offers = await call('عرض العروض', `/offers/request/${req.data.id}`, { actor: client, quiet: true });
      check('conflict', (offers.data || []).filter(o => o.status === 'accepted').length === 1, 'عرض واحد فقط حالته «مقبول»', `${(offers.data || []).filter(o => o.status === 'accepted').length} مقبول`, 'خطير');
      const winner = Number(state.data?.assigned_provider_id) === Number(a.id) ? a : b;
      await call('بدء التنفيذ', `/requests/${req.data.id}/status`, { actor: winner, method: 'PUT', quiet: true, body: { status: 'in_progress' } });
      const ends = await Promise.all([0, 1].map(() => call('تعارض: إنهاء مرتين', `/requests/${req.data.id}/status`, { actor: client, method: 'PUT', quiet: true, body: { status: 'completed' } })));
      const ended = await call('تفاصيل الطلب', `/requests/${req.data.id}`, { actor: client, quiet: true });
      check('conflict', ends.some(r => r.status === 200) && ends.every(r => r.status < 500) && ended.data?.status === 'completed', 'العميل ينهي الطلب مرتين معًا: يكتمل مرة واحدة بلا خطأ', `الحالات: ${ends.map(r => r.status).join('، ')}؛ حالة الطلب ${ended.data?.status}`, 'خطير');
      await twice('العميل يقيّم مرتين في اللحظة نفسها: تقييم واحد فقط', () => call('تعارض: تقييم مرتين', '/reviews', { actor: client, method: 'POST', quiet: true, body: { request_id: req.data.id, rating: 5, comment: 'ممتاز' } }), 1);
    }
    const conv = jobs.find(j => j.conversationId);
    if (conv) {
      const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => call('رسائل متزامنة', `/chat/conversations/${conv.conversationId}/messages`, { actor: i % 2 ? conv.client : conv.provider, method: 'POST', quiet: true, body: { content: `رسالة متزامنة ${i + 1}` } })));
      const ids = burst.filter(r => r.status === 201).map(r => Number(r.data.id));
      check('conflict', ids.length === 8 && new Set(ids).size === 8, '8 رسائل من الطرفين في اللحظة نفسها: كلها حُفظت بلا تكرار ولا ضياع', `حُفظ ${ids.length}، فريد ${new Set(ids).size}`);
      const fresh = await Promise.all([0, 1].map(() => call('تعارض: فتح محادثة', '/chat/conversations', { actor: conv.client, method: 'POST', quiet: true, body: { user_id: conv.provider.id, request_id: conv.requestId } })));
      check('conflict', fresh.every(r => r.data?.id) && fresh[0].data.id === fresh[1].data.id, 'فتح المحادثة نفسها مرتين معًا يعيد محادثة واحدة', fresh.map(r => r.data?.id).join(' / '));
    }
  }

  // ---- flooding ---------------------------------------------------------------------------------
  async function flood() {
    phase('الإغراق: هجوم طلبات كثيفة من عنوان واحد');
    const victim = C().find(p => p.token);
    let ip = '10.66.0.1';
    const wrong = await Promise.all(Array.from({ length: 30 }, (_, i) => call('إغراق: دخول خاطئ', '/auth/login', { ip, token: null, method: 'POST', quiet: true, body: { identifier: `nobody_${i}`, password: 'wrong-password' } })));
    const blocked = wrong.filter(r => r.status === 429).length;
    check('flood', blocked >= 5, '30 محاولة دخول خاطئة من عنوان واحد: الخادم يحظر الزائد (429)', `حُظر ${blocked} من 30`, 'خطير');
    say(`مهاجم جرّب 30 كلمة مرور من عنوان واحد → حُظر ${blocked}`, { actor: 'مهاجم', bad: blocked < 5 });
    ip = '10.66.0.2';
    const guesses = [];
    for (let i = 0; i < 7; i++) guesses.push(await call('إغراق: تخمين كلمة مرور', '/auth/login', { ip: `10.66.1.${i + 1}`, token: null, method: 'POST', quiet: true, body: { identifier: victim.username, password: `guess-${i}` } }));
    const locked = guesses.some(r => r.status === 423) || guesses.slice(-1)[0].status === 429;
    const real = await call('دخول بعد التخمين', '/auth/login', { ip: '10.66.1.99', token: null, method: 'POST', quiet: true, body: { identifier: victim.username, password: victim.password } });
    check('flood', locked || real.status === 200, 'تخمين كلمة مرور حساب واحد من عناوين مختلفة يُوقَف أو لا يضر صاحبه', `حالات التخمين: ${guesses.map(r => r.status).join('، ')}؛ دخول صاحب الحساب بعدها: ${real.status}`);
    check('gaps', real.status === 200 || real.status === 423, 'صاحب الحساب يعرف وضع حسابه بعد محاولات التخمين', `الحالة ${real.status}: ${real.message || ''}`);
    say(`مهاجم خمّن كلمة مرور ${victim.label} 7 مرات → ${guesses.some(r => r.status === 423) ? 'قُفل الحساب حتى إعادة التعيين' : 'لم يُقفل'}`, { actor: 'مهاجم' });
    const signups = await Promise.all(Array.from({ length: 30 }, (_, i) => call('إغراق: تسجيل حسابات', '/auth/register', { ip: '10.66.0.3', token: null, method: 'POST', quiet: true, body: { full_name: 'حساب آلي', username: `bot_${crypto.randomBytes(4).toString('hex')}`, password: 'Bot-123456-x', role: 'client' } })));
    const made = signups.filter(r => r.status === 201).length;
    check('flood', made <= 20, '30 حسابًا آليًا من عنوان واحد في لحظة: الخادم يحد العدد', `أُنشئ ${made} من 30`, 'خطير');
    say(`روبوت حاول إنشاء 30 حسابًا من عنوان واحد → أُنشئ ${made}`, { actor: 'مهاجم', bad: made > 20 });
    const spammer = people.find(p => p.token && jobs.some(j => j.conversationId && (j.client === p || j.provider === p)));
    const target = jobs.find(j => j.conversationId && (j.client === spammer || j.provider === spammer));
    if (spammer && target) {
      const spam = await Promise.all(Array.from({ length: 60 }, (_, i) => call('إغراق: رسائل', `/chat/conversations/${target.conversationId}/messages`, { actor: spammer, method: 'POST', quiet: true, body: { content: `إزعاج ${i}` } })));
      const refused = spam.filter(r => r.status === 429).length;
      check('flood', refused >= 10, '60 رسالة في لحظة من مستخدم واحد: الخادم يحد الإزعاج', `رُفض ${refused} من 60؛ الحالات: ${Object.entries(spam.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join('، ')}`);
      say(`${spammer.label} أرسل 60 رسالة في لحظة → رُفض ${refused}`, { actor: spammer.label, bad: refused < 10 });
    }
    if (victim) {
      const { io } = clientRequire('socket.io-client');
      const opened = await Promise.all(Array.from({ length: 16 }, () => new Promise(resolve => {
        const s = io(`http://127.0.0.1:${appPort}`, { auth: { token: victim.token }, transports: ['websocket'], reconnection: false, extraHeaders: { 'X-Forwarded-For': '10.66.0.4' } });
        sockets.push(s);
        s.on('connect', () => resolve(true)); s.on('connect_error', () => resolve(false)); setTimeout(() => resolve(false), 5000);
      })));
      await sleep(1500); // with several server copies the extra connections are closed a moment after opening
      const live = sockets.slice(-16).filter(s => s.connected).length;
      check('flood', live <= 13, '16 اتصالًا حيًّا لحساب واحد: الخادم يحد عددها', `فُتح ${live} من 16`);
      say(`حساب واحد حاول فتح 16 اتصالًا حيًّا → قُبل ${live}`, { actor: 'مهاجم', bad: live > 13 });
    }
    const big = await call('إغراق: طلب ضخم', '/requests', { actor: victim, method: 'POST', quiet: true, body: { title: 'x', description: 'ا'.repeat(6 * 1024 * 1024) } });
    check('flood', big.status === 413 || big.status === 400, 'طلب حجمه 12 ميجابايت يُرفض قبل معالجته', `الحالة ${big.status}`);
    const alive = await call('الخادم بعد الإغراق', '/health', { ip: '10.66.0.9', quiet: true });
    check('flood', alive.status === 200 && alive.ms < 1500, 'الخادم يبقى يرد بعد كل محاولات الإغراق', `الحالة ${alive.status} خلال ${alive.ms}ms`, 'خطير');
  }

  // ---- gaps: things a person would miss ----------------------------------------------------------
  async function gaps() {
    phase('النواقص: ما قد يفتقده المستخدم');
    const person = people.find(p => p.token);
    const latin = text => !/[؀-ۿ]/.test(String(text || ''));
    let r = await call('نقص: دخول خاطئ بالعربية', '/auth/login', { ip: '10.77.0.1', token: null, method: 'POST', quiet: true, body: { identifier: 'nobody_here', password: 'x' } });
    check('gaps', !latin(r.message), 'رسالة الدخول الخاطئ تظهر بالعربية', `«${r.message}»`);
    r = await call('نقص: دخول خاطئ بالهندية', '/auth/login', { ip: '10.77.0.2', token: null, lang: 'hi', method: 'POST', quiet: true, body: { identifier: 'nobody_here', password: 'x' } });
    check('gaps', /[ऀ-ॿ]/.test(r.message || ''), 'رسائل الخطأ تتبع لغة المستخدم (الهندية)', `«${r.message}»`);
    r = await call('نقص: صفحة غير موجودة', '/no-such-route', { actor: person, quiet: true });
    check('gaps', r.status === 404 && !latin(r.message), 'المسار غير الموجود يعيد رسالة مفهومة بالعربية', `الحالة ${r.status} «${r.message}»`);
    r = await call('نقص: بيانات ناقصة', '/offers', { actor: P().find(p => p.token), method: 'POST', quiet: true, body: {} });
    check('gaps', r.status >= 400 && r.status < 500 && Boolean(r.message), 'إرسال عرض بلا بيانات يعيد سببًا واضحًا', `الحالة ${r.status} «${r.message}»`);
    r = await call('نقص: كلمة مرور قصيرة', '/auth/register', { ip: '10.77.0.3', token: null, method: 'POST', quiet: true, body: { full_name: 'تجربة', username: `short_${crypto.randomBytes(3).toString('hex')}`, password: '12', role: 'client' } });
    check('gaps', r.status >= 400 && r.status < 500 && !latin(r.message), 'كلمة المرور القصيرة جدًا تُرفض برسالة عربية', `الحالة ${r.status} «${r.message}»`);
    for (const [route, title] of [['/categories', 'قائمة الأقسام'], ['/settings/public', 'الإعدادات العامة'], ['/stats/public', 'الإحصاءات العامة'], ['/visits', 'عداد الزوار'], ['/countries', 'قائمة الدول']]) {
      r = await call(`نقص: ${title}`, route, { token: null, ip: '10.77.0.4', quiet: true });
      check('gaps', r.status === 200, `${title} تعمل للزائر بلا تسجيل`, `الحالة ${r.status}`);
    }
    r = await call('نقص: الأقسام', '/categories', { token: null, ip: '10.77.0.4', quiet: true });
    check('gaps', Array.isArray(r.data) && r.data.length > 0, 'توجد أقسام خدمات جاهزة في تثبيت جديد', `${r.data?.length ?? 0} قسمًا`);
    if (bulk) {
      const provider = P().find(p => p.token);
      for (const [label, route] of [['قائمة الطلبات القريبة (50)', '/requests/nearby?latitude=26.33&longitude=43.98&radius=30&limit=50'], ['بحث الطلبات', '/requests/nearby?latitude=26.33&longitude=43.98&radius=30&q=' + encodeURIComponent('طلب آلي 12')],
        ['الإحصاءات العامة', '/stats/public'], ['قائمة المحادثات', '/chat/conversations'], ['الإشعارات', '/notifications']]) {
        for (let i = 0; i < 5; i++) await call(`مع الحشد: ${label}`, route, { actor: provider });
      }
    }
    const mine = await call('طلباتي', '/requests/my', { actor: C().find(p => p.token) });
    check('gaps', mine.status === 200, 'العميل يرى قائمة طلباته', `الحالة ${mine.status}`);
    const myOffers = await call('عروضي', '/offers/my', { actor: P().find(p => p.token) });
    check('gaps', myOffers.status === 200, 'المزود يرى قائمة عروضه', `الحالة ${myOffers.status}`);
    const calls = await call('سجل المكالمات', '/calls/history', { actor: person });
    check('gaps', calls.status === 200, 'سجل المكالمات يفتح', `الحالة ${calls.status}`);
    const job = jobs.find(j => j.conversationId);
    if (job) {
      const ring = await call('بدء مكالمة', '/calls', { actor: job.client, method: 'POST', body: { conversation_id: job.conversationId, call_type: 'audio' } });
      check('errors', ring.status === 200 && ring.data?.status === 'ringing', 'العميل يتصل بمزوده: المكالمة ترن', `الحالة ${ring.status} «${ring.message || ''}»`, 'خطير');
      if (ring.data?.id) {
        say(`${job.client.label} يتصل بـ ${job.provider.label} 📞`, { actor: job.client.label, peer: job.provider.label, chat: true });
        const incoming = await call('المكالمات الواردة', '/calls/active', { actor: job.provider });
        check('errors', (incoming.data || []).some(c => Number(c.id) === Number(ring.data.id) && c.direction === 'incoming'), 'المزود يرى المكالمة الواردة');
        const early = await call('رمز مكالمة قبل الرد', `/calls/${ring.data.id}/token`, { actor: job.provider, method: 'POST', quiet: true });
        check('security', early.status === 409, 'المتصَل به لا يدخل المكالمة قبل أن يرد', `الحالة ${early.status}`);
        const stranger = people.find(p => p.token && p !== job.client && p !== job.provider);
        const spy = await call('اختراق: مكالمة غيره', `/calls/${ring.data.id}/token`, { actor: stranger, method: 'POST', quiet: true });
        check('security', [403, 404].includes(spy.status), 'طرف ثالث لا يدخل مكالمة ليست له', `الحالة ${spy.status}`, 'خطير');
        const answer = await call('الرد على مكالمة', `/calls/${ring.data.id}/accept`, { actor: job.provider, method: 'POST' });
        check('errors', answer.status === 200, 'المزود يرد على المكالمة', `الحالة ${answer.status} «${answer.message || ''}»`);
        if (answer.status === 200) say(`${job.provider.label} ردّ على مكالمة ${job.client.label} ✅`, { actor: job.provider.label, peer: job.client.label, chat: true });
        const tokens = await Promise.all([job.client, job.provider].map(who => call('رمز دخول المكالمة', `/calls/${ring.data.id}/token`, { actor: who, method: 'POST' })));
        check('errors', tokens.every(t => t.status === 200 && t.data?.token), 'الطرفان يحصلان على رمز دخول المكالمة', tokens.map(t => t.status).join('، '));
        const busy = await call('مكالمة ثانية أثناء الأولى', '/calls', { actor: job.client, method: 'POST', quiet: true, body: { conversation_id: job.conversationId, call_type: 'audio' } });
        check('conflict', busy.status === 409 || busy.data?.id === ring.data.id, 'لا تبدأ مكالمة ثانية والأولى جارية', `الحالة ${busy.status}`);
        const hang = await call('إنهاء مكالمة', `/calls/${ring.data.id}/decline`, { actor: job.client, method: 'POST' });
        check('errors', hang.status === 200, 'إنهاء المكالمة', `الحالة ${hang.status}`);
        say(`انتهت مكالمة ${job.client.label} و${job.provider.label}`, { actor: job.client.label, peer: job.provider.label });
      }
      finding('gaps', 'ملاحظة', 'صوت المكالمة وصورتها لا يُختبران هنا', 'المحاكاة تختبر الرنين والرد والصلاحيات والإنهاء. نقل الصوت والصورة يحتاج خادم المكالمات (LiveKit) وجوالين حقيقيين.');
    }
    // The last requester signs out; their old session must stop working at once.
    const leaver = [...C()].reverse().find(p => p.token);
    const out = await call('تسجيل الخروج', '/auth/logout', { actor: leaver, method: 'POST' });
    check('errors', out.status === 200, 'تسجيل الخروج يعمل', `الحالة ${out.status}`);
    const stale = await call('جلسة بعد الخروج', '/auth/me', { actor: leaver, quiet: true });
    check('security', stale.status === 401, 'الجلسة تتوقف فور تسجيل الخروج', `الحالة ${stale.status}`, 'خطير');
    say(`${leaver.label} سجّل خروجه`, { actor: leaver.label });
    leaver.token = null;
  }

  // ---- speed ------------------------------------------------------------------------------------
  function speed() {
    phase('السرعة: مدة كل عملية تحت الضغط');
    const table = [];
    for (const [label, list] of timings) {
      const sorted = [...list].sort((x, y) => x - y);
      const row = { label, count: sorted.length, avg: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length), p95: percentile(sorted, 0.95), max: sorted[sorted.length - 1] };
      table.push(row);
      const heavy = /إنشاء حساب|تسجيل الدخول/.test(label); // password hashing is slow on purpose
      const limit = heavy ? 3000 : 800;
      if (label === 'تسجيل الدخول') row.label = `تسجيل الدخول (${together} في اللحظة نفسها)`;
      if (row.p95 > limit) finding('speed', row.p95 > limit * 2 ? 'خطير' : 'متوسط', `عملية بطيئة: ${row.label}`, `أبطأ 5٪ تأخذ ${row.p95}ms (الحد ${limit}ms)، المتوسط ${row.avg}ms، الأقصى ${row.max}ms، ${row.count} مرة`);
      else passes.speed += 1;
    }
    table.sort((x, y) => y.p95 - x.p95);
    const stalls = [...(prober?.stalls || [])].sort((x, y) => x - y);
    const stall = { p95: percentile(stalls, 0.95), max: stalls[stalls.length - 1] || 0, samples: stalls.length };
    check('speed', stall.max < 500, 'الخادم لا يتجمد على بقية المستخدمين أثناء الضغط', `أطول تجمد ${stall.max}ms، و95٪ من الفحوص تحت ${stall.p95}ms (${stall.samples} فحصًا كل 100ms)`, stall.max > 1500 ? 'خطير' : 'متوسط');
    check('speed', connectionsPeak <= 10 * workers, 'اتصالات قاعدة البيانات ضمن الحد', `أقصى اتصالات مفتوحة ${connectionsPeak} (الحد ${10 * workers} لـ ${workers} نسخة خادم)`);
    if (serverErrors.length) finding('errors', 'خطير', `سجل الخادم فيه ${serverErrors.length} خطأ أثناء المحاكاة`, [...new Set(serverErrors)].slice(0, 5).join(' | '));
    else passes.errors += 1;
    return { table, stall };
  }

  // ---- the run ----------------------------------------------------------------------------------
  let speedReport = { table: [], stall: {} }, fatal = null;
  try {
    await setup();
    await seedCrowd();
    makePeople();
    await signUp();
    await connectSockets();
    await marketplace();
    await chats();
    await completion();
    await theRush();
    if (rush) await connectSockets(); // the rush closed every live connection; the people reconnect
    await security();
    await conflicts();
    await gaps();
    await flood();
    speedReport = speed();
  } catch (err) {
    fatal = err.message;
    finding('errors', 'خطير', 'المحاكاة توقفت قبل نهايتها', err.stack?.slice(0, 500) || err.message);
  } finally {
    await teardown();
  }
  const summary = {
    startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000),
    providers, clients, together, signIn, crowd, rush: rushReport, workers, mode: bulk ? `حشد ${bulk.toLocaleString('en')} حساب` : load ? 'استقرار (عدد كبير)' : 'كل الاحتمالات',
    cleanedUp: true, // the copy is stopped and its database dropped in teardown(): nothing is left behind
    requests: stats.requests, failed5xx: stats.failed5xx, messages: stats.messages, delivered: stats.delivered,
    jobs: jobs.length, completed: jobs.filter(j => j.completed).length,
    memoryPeakMb, connectionsPeak, fatal, passes, findings, speed: speedReport,
  };
  emit({ type: 'done', summary });
  return summary;
}

module.exports = { runSimulation };
