// Creates and drops only its own randomly named localhost test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
if (process.env.AYK_ADMIN_MAINTENANCE_TEST !== '1') {
  test('admin maintenance PostgreSQL integration (AYK_ADMIN_MAINTENANCE_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_adminmaintenance_${crypto.randomBytes(10).toString('hex')}`;
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
  let server, base, created = false, client, provider, reader, forbiddenAdmin, conversation;
  const token = user => jwt.sign({ id: Number(user.id), role: user.role, scope: user.role === 'admin' ? 'admin' : 'site', sv: 0 });
  async function fixture(role, permissions = []) {
    const result = await db.query('INSERT INTO users (full_name, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
      [`Admin fixture ${role}`, `am_${crypto.randomBytes(8).toString('hex')}`, 'not-a-login-password', role, JSON.stringify(permissions)]);
    return db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
  }
  async function api(url, user, expected = 200, options = {}) {
    const response = await fetch(base + url, { ...options, headers: { ...(user ? { Authorization: `Bearer ${token(user)}`, 'X-Ayk-Scope': user.role === 'admin' ? 'admin' : 'site' } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const body = await response.json();
    assert.equal(response.status, expected, `${url}: ${JSON.stringify(body)}`);
    return body;
  }
  test.before(async () => {
    const admin = connection('postgres'); await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); created = true; } finally { await admin.end(); }
    const setup = await install.setupFromEnv();
    assert.deepEqual(setup.migrations.flatMap(item => item.errors), []);
    client = await fixture('client'); provider = await fixture('provider');
    reader = await fixture('admin', ['conversations.read', 'locations.manage', 'categories.manage']);
    forbiddenAdmin = await fixture('admin', ['dashboard.view']);
    conversation = await require('../models/Conversation').findOrCreateBetween(client.id, provider.id);
    await db.query("INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (?, ?, ?, 'text')", [conversation, client.id, 'Visible admin fixture']);
    await db.query("INSERT INTO messages (conversation_id, sender_id, content, message_type, deleted_at) VALUES (?, ?, ?, 'text', CURRENT_TIMESTAMP)", [conversation, provider.id, 'Deleted admin fixture']);
    server = require('../app').listen(0); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (created) { const admin = connection('postgres'); await admin.connect(); try { await admin.query(`DROP DATABASE "${databaseName}"`); } finally { await admin.end(); } }
  });
  test('PostgreSQL list/search/detail work, include deleted-author text, and record the privileged read', async () => {
    // Reproduce the previous failure on actual PostgreSQL, not merely a regex assertion.
    const legacyAggregate = db.translateSql("SELECT GROUP_CONCAT(CONCAT(u.id, ':', u.role) SEPARATOR ',') FROM users u");
    await assert.rejects(db.getPool().query(legacyAggregate), error => error.code === '42601');
    const list = await api('/admin/conversations', reader);
    assert.ok(list.data.some(row => Number(row.id) === Number(conversation)));
    const found = await api(`/admin/conversations?search=${encodeURIComponent(client.full_name)}`, reader);
    assert.ok(found.data.some(row => Number(row.id) === Number(conversation)));
    const { data } = await api(`/admin/conversations/${conversation}`, reader);
    assert.equal(data.participants.length, 2); assert.equal(data.messages.length, 2);
    assert.ok(data.messages.some(row => row.deleted_at && row.content === 'Deleted admin fixture'));
    assert.ok(await db.queryOne("SELECT id FROM activity_logs WHERE user_id = ? AND action = 'admin.conversation.read' AND entity_id = ?", [reader.id, conversation]));
    await api('/admin/conversations/2147483647', reader, 404);
  });
  test('admin conversation privilege never follows role alone or participant membership', async () => {
    for (const url of ['/admin/conversations', `/admin/conversations/${conversation}`, '/admin/live-locations']) {
      await api(url, null, 401); await api(url, client, 403); await api(url, forbiddenAdmin, 403);
    }
    await api('/admin/conversations/not-a-number', reader, 400);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversation, reader.id])).n), 0);
  });
  test('district writes normalize only the English suffix, and subservice CRUD retains its own permission', async () => {
    const { data } = await api('/districts', reader, 201, { method: 'POST', body: JSON.stringify({ city_id: 1, name_ar: 'حي اختبار Dist', name_en: 'Test Garden Dist.' }) });
    assert.equal(data.name_en, 'Test Garden'); assert.equal(data.name_ar, 'حي اختبار Dist');
    await api('/services', reader, 403, { method: 'POST', body: JSON.stringify({ category_id: 1, name_ar: 'خدمة اختبار' }) });
  });
  test('suffix migration journals old names, is idempotent, and rollback preserves later admin edits', async () => {
    const ids = [];
    for (const name of ['Fixture One Dist.', 'Fixture Two DIST', 'Fixture Dist Center', 'FixtureDistrict', 'Dist.']) {
      const result = await db.query('INSERT INTO districts (city_id, name_ar, name_en) VALUES (1, ?, ?)', [`حي ${crypto.randomBytes(6).toString('hex')}`, name]); ids.push(result.insertId);
    }
    const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/070_district_english_suffix.sql'), 'utf8');
    const run = async () => { for (const stmt of install.splitSql(install.mysqlToPg(migration))) await db.getPool().query(stmt); };
    await run(); await run();
    assert.equal((await db.queryOne('SELECT name_en FROM districts WHERE id = ?', [ids[0]])).name_en, 'Fixture One');
    assert.equal((await db.queryOne('SELECT name_en FROM districts WHERE id = ?', [ids[1]])).name_en, 'Fixture Two');
    assert.equal((await db.queryOne('SELECT name_en FROM districts WHERE id = ?', [ids[2]])).name_en, 'Fixture Dist Center');
    await db.query("UPDATE districts SET name_en = 'Later edit' WHERE id = ?", [ids[1]]);
    await db.query('UPDATE districts d SET name_en = b.old_name_en FROM district_name_cleanup_070 b WHERE d.id = b.district_id AND d.name_en = b.new_name_en');
    assert.equal((await db.queryOne('SELECT name_en FROM districts WHERE id = ?', [ids[0]])).name_en, 'Fixture One Dist.');
    assert.equal((await db.queryOne('SELECT name_en FROM districts WHERE id = ?', [ids[1]])).name_en, 'Later edit');
  });
}
