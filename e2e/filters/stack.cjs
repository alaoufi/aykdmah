#!/usr/bin/env node
// AYK-496: starts a disposable app + database with a large seeded data set for the filter tests
// (e2e/filters/*.mjs) and keeps it running until stopped. Never touches production: it refuses
// anything but a local PostgreSQL port, creates its own newly named database and drops it on exit.
//   AYK_TEST_PORT=55432 node e2e/filters/stack.cjs          (the API and the built client on FILTERS_PORT, default 5055)
// Writes e2e/filters/.out/fixtures.json (tokens, ids, the expected data) when it is ready.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const pgPort = Number(process.env.AYK_TEST_PORT || '');
if (![5432, 55432].includes(pgPort)) { console.error('Set AYK_TEST_PORT to a local test PostgreSQL port (55432 or 5432).'); process.exit(1); }
const databaseName = `ayk_test_filters_${crypto.randomBytes(6).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', AUTO_MIGRATE: 'false', DB_HOST: '127.0.0.1', DB_PORT: String(pgPort), DB_NAME: databaseName,
  DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
  MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '', BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), AZURE_TRANSLATOR_KEY: '', API_RATE_LIMIT: '1000000', UPLOAD_RATE_LIMIT: '1000000',
});
const requireServer = require('node:module').createRequire(path.join(root, 'server', 'package.json'));
const { Client } = requireServer('pg');
const maintenance = () => new Client({ host: '127.0.0.1', port: pgPort, user: 'postgres', password: '', database: 'postgres', ssl: false });
let server, created = false;
async function cleanup() {
  try { if (server) await new Promise(resolve => server.close(resolve)); } catch (_) { /* closing */ }
  try { await require(path.join(root, 'server/config/database')).getPool().end(); } catch (_) { /* closed */ }
  if (created) {
    const admin = maintenance(); await admin.connect();
    try { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.end(); }
    created = false;
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => cleanup().finally(() => process.exit(0)));
(async () => {
  const admin = maintenance(); await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); created = true; } finally { await admin.end(); }
  const db = require(path.join(root, 'server/config/database'));
  const install = require(path.join(root, 'server/services/installService'));
  const result = await install.setupFromEnv();
  if (result.migrations.flatMap(m => m.errors).length) throw new Error('migrations failed');
  const port = Number(process.env.FILTERS_PORT || 5055);
  // The API app serves the built client only in production; here the same thing is done by a small wrapper, so
  // that the browser tests run against the real pages without switching the app to production mode.
  const express = requireServer('express');
  const app = require(path.join(root, 'server/app'));
  if (process.env.FILTERS_DUMP_ROUTES === '1') { // for authz-probe.mjs: every route the server really registers
    const split = layer => { const m = layer.regexp.toString().replace('\\/?', '').replace('(?=\\/|$)', '$').match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//); return layer.regexp.fast_slash ? '' : m ? m[1].replace(/\\(.)/g, '$1') : ''; };
    const out = []; const walk = (stack, prefix) => { for (const l of stack) { if (l.route) for (const mt of Object.keys(l.route.methods)) out.push({ method: mt.toUpperCase(), path: prefix + l.route.path }); else if (l.name === 'router' && l.handle.stack) walk(l.handle.stack, prefix + split(l)); } };
    walk(app._router.stack, ''); fs.mkdirSync(path.join(__dirname, '.out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '.out/routes.json'), JSON.stringify(out));
  }
  const dist = process.env.FILTERS_DIST || path.join(root, 'client', 'dist');
  const outer = express();
  outer.use((req, res, next) => (/^\/(api|uploads|install)(\/|$)/.test(req.path) ? app(req, res, next) : next()));
  outer.use(express.static(dist, { index: false }));
  outer.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  server = outer.listen(port, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { seed } = require('./seed.cjs');
  const started = Date.now();
  const data = await seed({ base: `http://127.0.0.1:${port}/api`, db, log: message => console.log(`[seed] ${message}`),
    providers: Number(process.env.FILTERS_PROVIDERS || 150), clients: Number(process.env.FILTERS_CLIENTS || 60), requests: Number(process.env.FILTERS_REQUESTS || 600) });
  // An administrator for the admin-list tests.
  const admin2 = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboarding_version: 2, role: 'client', password: '1234', phone: '0599999999', city_id: 1, district_id: data.districtsOf[1][0] }) }).then(r => r.json());
  await db.query("UPDATE users SET role = 'admin', is_super_admin = 1, username = 'filter_admin' WHERE id = ?", [admin2.data.user.id]);
  const adminLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ayk-Scope': 'admin' },
    body: JSON.stringify({ identifier: 'filter_admin', password: '1234' }) }).then(r => r.json());
  const out = path.join(__dirname, '.out'); fs.mkdirSync(out, { recursive: true });
  const slim = rows => rows.map(({ token, ...rest }) => ({ ...rest, token }));
  fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify({ port, database: databaseName, adminToken: adminLogin.data?.token || null,
    providers: slim(data.providers), clients: slim(data.clients), requests: data.requests.map(r => ({ id: r.id, category: r.category, service: r.service, city: r.city, district: r.district, title: r.title, client: r.client.id })),
    chats: data.chats, onlyService: data.onlyService, goneClients: data.goneClients, blockedClients: data.blockedClients, categories: data.categories, servicesOf: data.servicesOf, districtsOf: data.districtsOf, cities: data.cities }));
  console.log(`[ready] http://127.0.0.1:${port} database=${databaseName} seeded in ${((Date.now() - started) / 1000).toFixed(0)}s`);
})().catch(async error => { console.error('[stack failed]', error); await cleanup(); process.exit(1); });
