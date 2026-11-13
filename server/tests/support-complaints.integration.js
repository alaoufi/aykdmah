// Support and complaints (AYK-212): the WhatsApp number setting, the complaint topic, and the
// new-message notification reaching only the admins who handle these messages. Creates and drops
// only its own randomly named localhost test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (process.env.AYK_SUPPORT_TEST !== '1') {
  test('support and complaints PostgreSQL integration (AYK_SUPPORT_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_support_${crypto.randomBytes(10).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || 55432);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid localhost test port');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '10000', DB_HOST: '127.0.0.1',
    DB_PORT: String(port), DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '',
    DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    PAYMENT_PROVIDER: '', WHATSAPP_PROVIDER: '', MAIL_HOST: '', GOOGLE_MAPS_API_KEY: '',
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const install = require('../services/installService');
  const jwt = require('../utils/jwt');
  const connection = database => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database, ssl: false });
  let server, base, created = false;
  const token = user => jwt.sign({ id: Number(user.id), role: user.role, scope: user.role === 'admin' ? 'admin' : 'site', sv: 0 });
  async function fixture(role, permissions = [], superAdmin = 0) {
    const result = await db.query('INSERT INTO users (full_name, username, password_hash, role, permissions, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [`Support fixture ${role}`, `sp_${crypto.randomBytes(8).toString('hex')}`, 'not-a-login-password', role, JSON.stringify(permissions), superAdmin]);
    return db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
  }
  async function api(url, user, expected = 200, method = 'GET', body) {
    const response = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { ...(user ? { Authorization: `Bearer ${token(user)}`, 'X-Ayk-Scope': user.role === 'admin' ? 'admin' : 'site' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`);
    return result;
  }
  test.before(async () => {
    const admin = connection('postgres'); await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); created = true; } finally { await admin.end(); }
    const setup = await install.setupFromEnv();
    assert.deepEqual(setup.migrations.flatMap(item => item.errors), []);
    server = require('../app').listen(0); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (created) { const admin = connection('postgres'); await admin.connect(); try { await admin.query(`DROP DATABASE "${databaseName}"`); } finally { await admin.end(); } }
  });

  test('the WhatsApp support number is public and starts as the owner\'s number', async () => {
    assert.equal((await api('/settings/public', null)).data.support_whatsapp, '0500785596');
  });

  test('hidden form fields (AYK-215) are a public setting that only settings admins change', async () => {
    assert.deepEqual((await api('/settings/public', null)).data.form_fields_hidden, {});
    const settingsAdmin = await fixture('admin', ['settings.manage']);
    const other = await fixture('admin', ['texts.manage']);
    const value = { request: ['title', 'voice'] };
    await api('/admin/settings', other, 403, 'PUT', { items: [{ key: 'form_fields_hidden', value }] });
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_hidden', value }] });
    assert.deepEqual((await api('/settings/public', null)).data.form_fields_hidden, value);
  });

  test('a complaint reaches only the admins who handle user messages', async () => {
    const full = await fixture('admin', [], 1);
    const handler = await fixture('admin', ['users.manage']);
    const textsOnly = await fixture('admin', ['texts.manage']);
    const client = await fixture('client');
    const ticket = (await api('/support', client, 201, 'POST', { topic: 'complaint', body: 'شكوى تجريبية' })).data;
    assert.equal(ticket.topic, 'complaint');
    const told = async user => Number((await db.queryOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'support_new'", [user.id])).n);
    assert.equal(await told(full), 1);
    assert.equal(await told(handler), 1);
    assert.equal(await told(textsOnly), 0);
    assert.equal(await told(client), 0);
    const list = (await api('/admin/support?topic=complaint', handler)).data;
    assert.ok(list.some(row => Number(row.id) === Number(ticket.id)));
    await api('/admin/support', textsOnly, 403);
    await api('/support', null, 401, 'POST', { topic: 'complaint', body: 'x' });
  });
}
