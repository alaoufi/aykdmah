#!/usr/bin/env node
// Which statements does one request run? (AYK-256) Starts a private copy of the app on a throw-away
// local database with SQL_TRACE=1, makes each request twice and prints the statements of the second
// (the first warms caches), with their durations. Removed at the end, like every simulation.
//   node simulator/trace.js            every request below         node simulator/trace.js send me
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(ROOT, 'server/package.json'));
const { Client } = serverRequire('pg');
const jwt = serverRequire('jsonwebtoken');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pg = { host: '127.0.0.1', port: Number(process.env.SIM_PG_PORT || 5432), user: process.env.SIM_PG_USER || 'postgres', password: process.env.SIM_PG_PASSWORD || '', ssl: false };

(async () => {
  const dbName = `ayk_sim_${crypto.randomBytes(6).toString('hex')}`, port = 4990 + Math.floor(Math.random() * 9);
  const secret = crypto.randomBytes(48).toString('hex');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development', AUTO_MIGRATE: 'false', TRUST_PROXY: '1', APP_PORT: String(port), SQL_TRACE: '1',
    APP_URL: `http://127.0.0.1:${port}`, CLIENT_URL: `http://127.0.0.1:${port}`, DB_HOST: pg.host, DB_PORT: String(pg.port), DB_USER: pg.user, DB_PASSWORD: pg.password,
    DB_NAME: dbName, DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '', JWT_SECRET: secret, ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    PAYMENT_PROVIDER: 'test', GEOIP_DISABLE: '1', API_RATE_LIMIT: '100000000' };
  const admin = new Client({ ...pg, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  let app;
  try {
    execFileSync(process.execPath, ['-e', "require('./server/services/installService').setupFromEnv().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})"], { cwd: ROOT, env: { ...env, SQL_TRACE: '' }, stdio: 'ignore' });
    const seed = JSON.parse(execFileSync(process.execPath, ['-e', `
      (async () => {
        const db = require('./server/config/database');
        const Conversation = require('./server/models/Conversation');
        await db.query("INSERT INTO users (full_name, email, password_hash, role, latitude, longitude) SELECT 'مستخدم ' || g, 'trace' || g || '@sim.invalid', 'x', CASE WHEN g % 2 = 0 THEN 'provider' ELSE 'client' END, 26.33, 43.98 FROM generate_series(1, 200) g");
        const people = await db.query("SELECT id, role FROM users WHERE email LIKE 'trace%' ORDER BY id LIMIT 2");
        const client = people.find(p => p.role === 'client'), provider = people.find(p => p.role === 'provider');
        const r = await db.query("INSERT INTO requests (client_id, title, description, assigned_provider_id, status) VALUES (?, 'طلب', 'وصف', ?, 'assigned')", [client.id, provider.id]);
        const conv = await Conversation.findOrCreateBetween(client.id, provider.id, r.insertId);
        await db.query("INSERT INTO messages (conversation_id, sender_id, content, message_type) SELECT ?, ?::int, 'رسالة ' || g, 'text' FROM generate_series(1, 30) g", [conv, provider.id]);
        console.log(JSON.stringify({ client: client.id, provider: provider.id, conv }));
        await db.getPool().end();
      })().catch(e => { console.error(e.message); process.exit(1); });`], { cwd: ROOT, env: { ...env, SQL_TRACE: '' } }).toString().trim().split('\n').pop());
    app = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env });
    let log = '';
    app.stdout.on('data', d => { log += d; });
    app.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch (_) { /* starting */ } await sleep(250); }
    const token = jwt.sign({ id: seed.client, role: 'client', auth_version: 0, scope: 'site', sv: 0 }, secret, { algorithm: 'HS256', expiresIn: '1h' });
    const requests = {
      send: ['POST', `/api/chat/conversations/${seed.conv}/messages`, { content: 'رسالة تتبع' }],
      me: ['GET', '/api/auth/me'],
      read: ['GET', `/api/chat/conversations/${seed.conv}/messages`],
      unread: ['GET', '/api/chat/unread'],
      conversations: ['GET', '/api/chat/conversations'],
      notifications: ['GET', '/api/notifications'],
      ...Object.fromEntries((process.env.TRACE_EXTRA || '').split(',').filter(Boolean).map(p => [p, ['GET', p]])),
    };
    const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(requests);
    for (const name of wanted) {
      const [method, route, body] = requests[name] || ['GET', name];
      const go = () => fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.9.9' }, body: body ? JSON.stringify(body) : undefined });
      await go(); await sleep(1500); // also lets background work of the first call finish
      log = '';
      const t0 = Date.now(); const res = await go(); const ms = Date.now() - t0;
      await sleep(1500);
      const lines = log.split('\n').filter(l => l.startsWith('SQLT '));
      const total = lines.reduce((s, l) => s + Number(l.split(' ')[1]), 0);
      console.log(`\n== ${name}: ${method} ${route} -> ${res.status} in ${ms}ms; ${lines.length} statements, ${total.toFixed(1)}ms in the database`);
      for (const l of lines) console.log('  ' + l.slice(5));
    }
  } finally {
    if (app) { app.kill('SIGTERM'); await sleep(800); if (app.exitCode === null) app.kill('SIGKILL'); }
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
