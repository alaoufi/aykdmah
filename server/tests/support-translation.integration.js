// Messages with the administration reach each reader in their own language (the owner: «الرسائل
// المتبادلة مع الإدارة تصل لكل قارئ بلغته»): the writer reads the account's language, the
// administration reads Arabic, and a failing translator changes nothing. The translation provider
// is replaced by an offline stand-in. Creates and drops only its own randomly named localhost test
// database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (process.env.AYK_SUPPORT_TEST !== '1') {
  test('support translation PostgreSQL integration (AYK_SUPPORT_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_supporttr_${crypto.randomBytes(10).toString('hex')}`;
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
      [`Support translation fixture ${role}`, `spt_${crypto.randomBytes(8).toString('hex')}`, 'not-a-login-password', role, JSON.stringify(permissions), superAdmin]);
    return db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
  }
  async function api(url, user, expected = 200, method = 'GET', body) {
    const response = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { ...(user ? { Authorization: `Bearer ${token(user)}`, 'X-Ayk-Scope': user.role === 'admin' ? 'admin' : 'site', 'Accept-Language': user.lang || 'ar' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } });
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

  const translationService = require('../services/translationService');
  const realTranslate = translationService.translate;
  let failing = false;
  const calls = [];
  test.beforeEach(() => {
    failing = false; calls.length = 0;
    // Offline stand-in: tags the text with the target language, or fails like a provider that is down.
    translationService.translate = async (value, from, to) => {
      calls.push({ value, to });
      if (failing) throw new Error('provider down');
      return { text: `[${to}] ${value}`, provider: 'test' };
    };
  });
  test.afterEach(() => { translationService.translate = realTranslate; });

  test('the Urdu writer reads the Arabic reply in Urdu; the administration reads the writer in Arabic', async () => {
    const writer = await fixture('client');
    // The account's language is the one the writer uses the site in (kept from Accept-Language).
    writer.lang = 'ur';
    await db.query("UPDATE users SET ui_lang = 'ur' WHERE id = ?", [writer.id]);
    const handler = await fixture('admin', ['users.manage']);
    const question = 'میرا آرڈر نہیں پہنچا';
    const opened = (await api('/support', writer, 201, 'POST', { topic: 'support', body: question })).data;
    // The writer's own message is not translated back to them, and it was prepared in Arabic.
    assert.equal(opened.messages[0].body, question);
    assert.equal(opened.messages[0].body_translated, undefined);
    assert.ok(calls.some(call => call.value === question && call.to === 'ar'));

    const asAdmin = (await api(`/admin/support/${opened.id}`, handler)).data;
    assert.equal(asAdmin.messages[0].body, question);
    assert.equal(asAdmin.messages[0].body_translated, `[ar] ${question}`);
    const adminRow = (await api('/admin/support', handler)).data.find(row => Number(row.id) === Number(opened.id));
    assert.equal(adminRow.last_body_translated, `[ar] ${question}`);

    const answer = 'تم شحن طلبك اليوم';
    calls.length = 0;
    const replied = (await api(`/admin/support/${opened.id}/messages`, handler, 201, 'POST', { body: answer })).data;
    // The reply was prepared in the writer's language, and the admin reads their own reply as written.
    assert.ok(calls.some(call => call.value === answer && call.to === 'ur'));
    const adminCopy = replied.messages.find(m => Number(m.from_admin));
    assert.equal(adminCopy.body, answer);
    assert.equal(adminCopy.body_translated, undefined);

    const mine = (await api(`/support/${opened.id}`, writer)).data;
    const reply = mine.messages.find(m => Number(m.from_admin));
    assert.equal(reply.body, answer);
    assert.equal(reply.body_translated, `[ur] ${answer}`);
    assert.equal(mine.messages.find(m => !Number(m.from_admin)).body_translated, undefined);
    const myRow = (await api('/support', writer)).data.find(row => Number(row.id) === Number(opened.id));
    assert.equal(myRow.last_body, answer);
    assert.equal(myRow.last_body_translated, `[ur] ${answer}`);

    // The writer answers back: the thread they get keeps the reply translated for them.
    const back = (await api(`/support/${opened.id}/messages`, writer, 201, 'POST', { body: 'شکریہ' })).data;
    assert.equal(back.messages.find(m => Number(m.from_admin)).body_translated, `[ur] ${answer}`);
  });

  test('with the translator failing, every message stays the original and the requests still succeed', async () => {
    failing = true;
    const writer = await fixture('client');
    // The account's language is the one the writer uses the site in (kept from Accept-Language).
    writer.lang = 'ur';
    await db.query("UPDATE users SET ui_lang = 'ur' WHERE id = ?", [writer.id]);
    const handler = await fixture('admin', ['users.manage']);
    const opened = (await api('/support', writer, 201, 'POST', { topic: 'suggestion', body: 'ایک تجویز' })).data;
    await api(`/admin/support/${opened.id}/messages`, handler, 201, 'POST', { body: 'شكرًا على اقتراحك' });
    const mine = (await api(`/support/${opened.id}`, writer)).data;
    const theirs = (await api(`/admin/support/${opened.id}`, handler)).data;
    for (const message of [...mine.messages, ...theirs.messages]) assert.equal(message.body_translated, undefined);
    assert.equal(mine.messages.length, 2);
    for (const row of [...(await api('/support', writer)).data, ...(await api('/admin/support', handler)).data]) {
      assert.equal(row.last_body_translated, undefined);
    }
    assert.ok(calls.length > 0, 'the translator was asked and failed');
  });
}
