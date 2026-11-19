// Interface texts edited from the admin area (AYK-210). Creates and drops only its own randomly
// named localhost test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (process.env.AYK_UI_TEXTS_TEST !== '1') {
  test('interface texts PostgreSQL integration (AYK_UI_TEXTS_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_uitexts_${crypto.randomBytes(10).toString('hex')}`;
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
  let server, base, created = false, client, editor, otherAdmin;
  const token = user => jwt.sign({ id: Number(user.id), role: user.role, scope: user.role === 'admin' ? 'admin' : 'site', sv: 0 });
  async function fixture(role, permissions = []) {
    const result = await db.query('INSERT INTO users (full_name, username, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
      [`Texts fixture ${role}`, `ut_${crypto.randomBytes(8).toString('hex')}`, 'not-a-login-password', role, JSON.stringify(permissions)]);
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
    client = await fixture('client');
    editor = await fixture('admin', ['texts.manage']);
    otherAdmin = await fixture('admin', ['settings.manage']);
    server = require('../app').listen(0); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (created) { const admin = connection('postgres'); await admin.connect(); try { await admin.query(`DROP DATABASE "${databaseName}"`); } finally { await admin.end(); } }
  });

  test('an edited text reaches everyone at once, and resetting it restores the built-in text', async () => {
    assert.deepEqual((await api('/texts/ar', null)).data, {});
    const key = 'requester.directory_empty';
    await api('/admin/texts', editor, 200, 'PUT', { lang: 'ar', key, value: 'لا توجد سجلات' });
    assert.deepEqual((await api('/texts/ar', null)).data, { [key]: 'لا توجد سجلات' });
    assert.deepEqual((await api('/texts/en', null)).data, {});
    await api('/admin/texts', editor, 200, 'PUT', { lang: 'ar', key, value: 'نص ثانٍ' });
    assert.equal((await api('/texts/ar', null)).data[key], 'نص ثانٍ');
    const list = (await api('/admin/texts', editor)).data;
    assert.equal(list.length, 1);
    assert.equal(list[0].text_value, 'نص ثانٍ');
    assert.ok(await db.queryOne("SELECT id FROM activity_logs WHERE user_id = ? AND action = 'ui_text_update'", [editor.id]));
    await api('/admin/texts/reset', editor, 200, 'POST', { lang: 'ar', key });
    assert.deepEqual((await api('/texts/ar', null)).data, {});
    assert.equal((await api('/admin/texts', editor)).data.length, 0);
  });

  test('saving the Arabic text with translate_all updates every language, keeping {{values}} intact', async () => {
    const translationService = require('../services/translationService');
    const original = translationService.translate;
    // Offline stand-in for the translation provider: tags the text with its language, and fails
    // for Amharic and loses the marker for Turkish, which must both be skipped.
    translationService.translate = async (text, from, to) => {
      if (to === 'am') throw new Error('provider down');
      if (to === 'tr') return { text: 'çeviri', provider: 'test' };
      return { text: `[${to}] ${text}`, provider: 'test' };
    };
    try {
      const key = 'admin.texts.count';
      const saved = (await api('/admin/texts', editor, 200, 'PUT', { lang: 'ar', key, value: 'عرض {{shown}} من {{total}}', translate_all: true })).data;
      assert.deepEqual(saved.skipped.sort(), ['am', 'tr']);
      assert.equal(Object.keys(saved.translations).length, 8);
      assert.equal((await api('/texts/en', null)).data[key], '[en] عرض {{shown}} من {{total}}');
      assert.equal((await api('/texts/ur', null)).data[key], '[ur] عرض {{shown}} من {{total}}');
      assert.equal((await api('/texts/am', null)).data[key], undefined);
      assert.equal((await api('/texts/tr', null)).data[key], undefined);
      await api('/admin/texts', editor, 400, 'PUT', { lang: 'ar', key, value: 'x', translate_all: 'yes' });
      await api('/admin/texts/reset', editor, 200, 'POST', { lang: 'ar', key, all_languages: true });
      for (const code of ['ar', 'en', 'ur']) assert.equal((await api(`/texts/${code}`, null)).data[key], undefined);
    } finally { translationService.translate = original; }
  });

  test('only admins with the texts permission can change texts, and invalid input is refused', async () => {
    const body = { lang: 'ar', key: 'common.brand', value: 'اسم' };
    await api('/admin/texts', null, 401, 'PUT', body);
    await api('/admin/texts', client, 403, 'PUT', body);
    await api('/admin/texts', otherAdmin, 403, 'PUT', body);
    await api('/admin/texts', otherAdmin, 403);
    await api('/admin/texts/reset', otherAdmin, 403, 'POST', { lang: 'ar', key: 'common.brand' });
    for (const bad of [
      { lang: 'xx', key: 'common.brand', value: 'x' },
      { lang: 'ar', key: 'brand', value: 'x' },
      { lang: 'ar', key: 'common.brand;drop', value: 'x' },
      { lang: 'ar', key: 'common.brand', value: '   ' },
      { lang: 'ar', key: 'common.brand', value: 'x'.repeat(5001) },
      { lang: 'ar', key: 'common.brand', value: 5 },
    ]) await api('/admin/texts', editor, 400, 'PUT', bad);
    await api('/texts/xx', null, 400);
    assert.deepEqual((await api('/texts/ar', null)).data, {});
  });
}
