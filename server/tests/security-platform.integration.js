// All writes are confined to a fresh disposable localhost database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const name = `ayk_test_platform_${crypto.randomBytes(7).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432',
  DB_NAME: name, DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
  DB_SSL: 'false', AUTO_MIGRATE: 'false', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  CLIENT_URL: 'https://ayk-test.invalid', APP_URL: 'https://ayk-test.invalid',
  MAIL_HOST: '', PAYMENT_PROVIDER: '', BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
});
const { Client } = require('pg');
const db = require('../config/database');
const Setting = require('../models/Setting');
const { sign } = require('../utils/jwt');
const admin = new Client({ host: '127.0.0.1', port: Number(process.env.DB_PORT), user: 'postgres', database: 'postgres' });
let server, base, ownerToken, limitedToken, createdDatabase = false;

async function call(path, { token, body, method = 'GET', origin } = {}) {
  const response = await fetch(base + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, data: await response.json() };
}
test.before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  createdDatabase = true;
  const setup = await require('../services/installService').setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  for (const [superAdmin, permissions] of [[1, []], [0, ['dashboard.view']]]) {
    const row = await db.query(`INSERT INTO users (full_name, password_hash, role, is_super_admin, permissions)
      VALUES (?, 'unused-local-hash', 'admin', ?, ?)`, ['Security test admin', superAdmin, JSON.stringify(permissions)]);
    const token = sign({ id: Number(row.insertId), role: 'admin', auth_version: 0 });
    if (superAdmin) ownerToken = token; else limitedToken = token;
  }
  server = require('../app').listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.getPool().end();
  try { if (createdDatabase) await admin.query(`DROP DATABASE "${name}"`); } finally { await admin.end(); }
});

test('recovery, wipe, installer and private disk routes are unreachable', async () => {
  for (const path of ['/api/setup', '/api/setup/wipe-and-create-admin', '/api/setup/test-data/wipe', '/install', '/uploads/private.png']) {
    const r = await fetch(base + path, { method: path.endsWith('/wipe') ? 'POST' : 'GET' });
    assert.equal(r.status, 404, path);
  }
  assert.equal(Number((await db.queryOne("SELECT COUNT(*) total FROM users WHERE role='admin'")).total), 2);
});
test('HTTP policy blocks foreign credential access and exposes no database metadata', async () => {
  const trusted = await call('/api/health', { origin: 'https://ayk-test.invalid' });
  assert.equal(trusted.response.headers.get('access-control-allow-origin'), 'https://ayk-test.invalid');
  const foreign = await call('/api/health', { origin: 'https://attacker.invalid' });
  assert.equal(foreign.response.headers.get('access-control-allow-origin'), null);
  assert.match(foreign.response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(foreign.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(foreign.response.headers.get('cache-control'), 'no-store');
  assert.equal(foreign.response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual((await call('/api/health/db')).data, { ok: true });
});
test('settings preserve private registry metadata and reject unknown keys atomically', async () => {
  await Setting.set('private_security_token', 'local-test-secret', 'string', 'security', 0);
  const changed = await call('/api/admin/settings', { method: 'PUT', token: ownerToken, body: { items: [{ key: 'private_security_token', value: 'replacement', is_public: 1, type: 'json', group: 'general' }] } });
  assert.equal(changed.response.status, 200);
  const row = await db.queryOne("SELECT * FROM settings WHERE setting_key = 'private_security_token'");
  assert.equal(row.is_public, 0); assert.equal(row.setting_type, 'string'); assert.equal(row.setting_group, 'security');
  const invalid = await call('/api/admin/settings', { method: 'PUT', token: ownerToken, body: { items: [{ key: 'private_security_token', value: 'must-roll-back' }, { key: 'unknown_setting', value: 'x' }] } });
  assert.equal(invalid.response.status, 400);
  assert.equal(await Setting.get('private_security_token'), 'replacement');
  await db.query("UPDATE settings SET is_public = 1 WHERE setting_key = 'private_security_token'");
  assert.equal(Object.hasOwn((await call('/api/settings/public')).data.data, 'private_security_token'), false);
});
test('integration management needs its own permission and rejects arbitrary credentials/SSRF hosts', async () => {
  assert.equal((await call('/api/admin/integrations', { token: limitedToken })).response.status, 403);
  const unknown = await call('/api/admin/integrations', { token: ownerToken, method: 'POST', body: { type: 'email', provider: 'resend', credentials: { raw: '/etc/passwd' } } });
  assert.equal(unknown.response.status, 400);
  const ssrf = await call('/api/admin/integrations', { token: ownerToken, method: 'POST', body: { type: 'nafath', provider: 'nafath_api', credentials: { base_url: 'https://127.0.0.1', client_id: 'local', client_secret: 'unused' } } });
  assert.equal(ssrf.response.status, 400);
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) total FROM api_integrations')).total), 0);
});
test('dashboard-only administrators do not receive account, request or communication details', async () => {
  const r = await call('/api/admin/dashboard', { token: limitedToken });
  assert.equal(r.response.status, 200);
  assert.deepEqual(r.data.data.recent_users, []);
  assert.deepEqual(r.data.data.recent_requests, []);
  assert.equal(Object.hasOwn(r.data.data.stats, 'messages'), false);
});
test('an idle database disconnect does not crash the API and a later request reconnects', async () => {
  const pid = await db.queryOne('SELECT pg_backend_pid() AS pid');
  const pool = db.getPool();
  const disconnected = new Promise(resolve => pool.once('error', resolve));
  await admin.query('SELECT pg_terminate_backend($1)', [pid.pid]);
  const error = await disconnected;
  assert.equal(error.code, '57P01');
  assert.deepEqual((await call('/api/health/db')).data, { ok: true });
});
