#!/usr/bin/env node
// Where is the limit? (AYK-251) Measures the most requests per second the server can answer,
// per kind of request, with 1 server copy and with several, using the external load tool `wrk`
// (so the simulator's own speed does not limit the result), and how the processor time splits
// between the server and the database. Isolated like every simulation: a throw-away local
// database and a private copy of the app, removed at the end.
//   node simulator/bench.js [copies...]        e.g.  node simulator/bench.js 1 2 3
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(ROOT, 'server/package.json'));
const { Client } = serverRequire('pg');
const jwt = serverRequire('jsonwebtoken');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SECONDS = Number(process.env.BENCH_SECONDS || 8), CONNECTIONS = Number(process.env.BENCH_CONNECTIONS || 200), USERS = 5000;
const pg = { host: '127.0.0.1', port: Number(process.env.SIM_PG_PORT || 5432), user: process.env.SIM_PG_USER || 'postgres', password: process.env.SIM_PG_PASSWORD || '', ssl: false };

const cpuOf = pid => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / 100; } catch (_) { return 0; } };
const pids = name => { try { return execFileSync('pgrep', ['-x', name]).toString().trim().split('\n').filter(Boolean); } catch (_) { return []; } };
const children = pid => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean); } catch (_) { return []; } };

async function run(copies) {
  const dbName = `ayk_sim_${crypto.randomBytes(6).toString('hex')}`, port = 4900 + Math.floor(Math.random() * 90);
  const secret = crypto.randomBytes(48).toString('hex');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', AUTO_MIGRATE: 'false', TRUST_PROXY: '1', APP_PORT: String(port),
    APP_URL: `http://127.0.0.1:${port}`, CLIENT_URL: `http://127.0.0.1:${port}`, DB_HOST: pg.host, DB_PORT: String(pg.port), DB_USER: pg.user, DB_PASSWORD: pg.password,
    DB_NAME: dbName, DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '', JWT_SECRET: secret, ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    PAYMENT_PROVIDER: 'test', GEOIP_DISABLE: '1', API_RATE_LIMIT: '100000000', ...(copies > 1 ? { APP_WORKERS: String(copies) } : {}) };
  const admin = new Client({ ...pg, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  let app;
  const rows = [];
  try {
    execFileSync(process.execPath, ['-e', "require('./server/services/installService').setupFromEnv().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})"], { cwd: ROOT, env, stdio: 'ignore' });
    const db = new Client({ ...pg, database: dbName });
    await db.connect();
    await db.query(`INSERT INTO users (full_name, email, password_hash, role) SELECT 'مستخدم ' || g, 'bench' || g || '@sim.invalid', 'x', CASE WHEN g % 2 = 0 THEN 'provider' ELSE 'client' END FROM generate_series(1, $1) g`, [USERS]);
    await db.query(`INSERT INTO requests (client_id, title, description, status, latitude, longitude, address) SELECT u.id, 'طلب ' || u.id, 'وصف', 'open', 26.2 + random() * 0.3, 43.8 + random() * 0.4, 'بريدة' FROM users u WHERE u.role = 'client'`);
    await db.query('ANALYZE');
    const users = (await db.query("SELECT id, role FROM users WHERE email LIKE 'bench%' ORDER BY id LIMIT 2000")).rows;
    await db.end();
    const tokens = users.map(u => jwt.sign({ id: u.id, role: u.role, auth_version: 0, scope: 'site', sv: 0 }, secret, { algorithm: 'HS256', expiresIn: '1h' }));
    const lua = path.join(os.tmpdir(), `bench-${dbName}.lua`);
    fs.writeFileSync(lua, `local tokens = {${tokens.map(t => `"${t}"`).join(',')}}\nlocal i = 0\nrequest = function()\n  i = (i % #tokens) + 1\n  return wrk.format("GET", nil, {["Authorization"]="Bearer " .. tokens[i], ["X-Forwarded-For"]="12." .. (i % 250) .. "." .. (math.floor(i / 250) % 250) .. ".7", ["Accept-Encoding"]="gzip"})\nend\n`);
    app = spawn(process.execPath, [...(process.env.BENCH_PROFILE ? ['--cpu-prof', `--cpu-prof-dir=${process.env.BENCH_PROFILE}`] : []), 'server/server.js'], { cwd: ROOT, env, stdio: 'ignore' });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch (_) { /* starting */ } await sleep(250); }
    await sleep(copies > 1 ? 2500 : 500);
    const serverCpu = () => cpuOf(app.pid) + children(app.pid).reduce((s, p) => s + cpuOf(p), 0);
    const dbCpu = () => pids('postgres').reduce((s, p) => s + cpuOf(p), 0);
    for (const [name, route] of [['فحص الحياة (بلا قاعدة بيانات)', '/api/health'], ['الأقسام (محفوظة 5 ثوانٍ)', '/api/categories'], ['بياناتي (جلسة + قاعدة بيانات)', '/api/auth/me'],
      ['عدد غير المقروء', '/api/chat/unread'], ['الطلبات القريبة (بحث جغرافي)', '/api/requests/nearby?latitude=26.33&longitude=43.98&radius=20&limit=12']].filter(([, r]) => !process.env.BENCH_ONLY || r.includes(process.env.BENCH_ONLY))) {
      const c0 = { s: serverCpu(), d: dbCpu() };
      const out = execFileSync('wrk', ['-t2', `-c${CONNECTIONS}`, `-d${SECONDS}s`, '--latency', '-s', lua, `http://127.0.0.1:${port}${route}`]).toString();
      const rps = Number(/Requests\/sec:\s+([\d.]+)/.exec(out)?.[1] || 0);
      const p99 = /99%\s+([\d.]+\w+)/.exec(out)?.[1] || '?', p50 = /50%\s+([\d.]+\w+)/.exec(out)?.[1] || '?';
      const bad = Number(/Non-2xx or 3xx responses:\s+(\d+)/.exec(out)?.[1] || 0);
      const total = Number(/(\d+) requests in/.exec(out)?.[1] || 1);
      const s = serverCpu() - c0.s, d = dbCpu() - c0.d;
      rows.push({ copies, name, rps: Math.round(rps), p50, p99, failed: bad, serverMs: Number((s / total * 1000).toFixed(2)), dbMs: Number((d / total * 1000).toFixed(2)), serverCores: Number((s / SECONDS).toFixed(1)), dbCores: Number((d / SECONDS).toFixed(1)) });
      await sleep(5200); // the 5-second cache and connection pools settle between measurements
    }
    fs.rmSync(lua, { force: true });
  } finally {
    if (app) { app.kill(process.env.BENCH_PROFILE ? 'SIGINT' : 'SIGTERM'); await sleep(process.env.BENCH_PROFILE ? 4000 : 1500); if (app.exitCode === null) app.kill('SIGKILL'); }
    await sleep(500);
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
  return rows;
}

(async () => {
  const list = process.argv.slice(2).map(Number).filter(n => n >= 1);
  const all = [];
  for (const copies of list.length ? list : [1]) all.push(...await run(copies));
  console.log(`cores on this machine: ${os.cpus().length}; ${CONNECTIONS} connections for ${SECONDS}s each`);
  console.table(all.map(r => ({ 'نسخ الخادم': r.copies, 'الطلب': r.name, 'طلب/ثانية': r.rps, 'الوسيط': r.p50, '99٪': r.p99, 'فشل': r.failed, 'معالج الخادم لكل طلب ms': r.serverMs, 'معالج القاعدة لكل طلب ms': r.dbMs, 'أنوية الخادم': r.serverCores, 'أنوية القاعدة': r.dbCores })));
  if (process.env.BENCH_JSON) fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(all, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
