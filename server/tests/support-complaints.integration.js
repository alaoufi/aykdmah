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

  test('a field made required (AYK-218) is enforced by the server, unless it is hidden', async () => {
    const settingsAdmin = await fixture('admin', ['settings.manage']);
    const client = await fixture('client');
    const category = await db.queryOne('SELECT id FROM categories WHERE is_active = 1 ORDER BY id LIMIT 1');
    const post = async (body, expected) => {
      const response = await fetch(`${base}/requests`, { method: 'POST', body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${token(client)}`, 'Content-Type': 'application/json', 'Accept-Language': 'ar' } });
      const result = await response.json();
      if (expected) assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
    assert.deepEqual((await api('/settings/public', null)).data.form_fields_required, { account_type: ['coverage'] });
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_hidden', value: {} }] });
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_required', value: { request: ['title'] } }] });
    assert.equal((await post({ category_id: category.id }, 400)).message, 'أكمل الحقول الإجبارية في النموذج');
    assert.notEqual((await post({ category_id: category.id, title: 'عنوان' })).message, 'أكمل الحقول الإجبارية في النموذج');
    // «تفاصيل الطلب» can be required too (AYK-229).
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_required', value: { request: ['details'] } }] });
    assert.equal((await post({ category_id: category.id, title: 'عنوان' }, 400)).message, 'أكمل الحقول الإجبارية في النموذج');
    assert.notEqual((await post({ category_id: category.id, title: 'عنوان', description: 'تفاصيل' })).message, 'أكمل الحقول الإجبارية في النموذج');
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_required', value: { request: ['title'] } }] });
    // Hidden makes it optional again.
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [{ key: 'form_fields_hidden', value: { request: ['title'] } }] });
    assert.notEqual((await post({ category_id: category.id })).message, 'أكمل الحقول الإجبارية في النموذج');
    await api('/admin/settings', settingsAdmin, 200, 'PUT', { items: [
      { key: 'form_fields_hidden', value: {} }, { key: 'form_fields_required', value: { account_type: ['coverage'] } }] });
  });

  test('a refused account type change says why, with a code the page turns into a way out (AYK-219)', async () => {
    const admin = await fixture('admin', [], 1);
    const siteToken = jwt.sign({ id: Number(admin.id), role: 'admin', scope: 'site', sv: 0 });
    const response = await fetch(`${base}/users/me/role`, { method: 'PUT', body: JSON.stringify({ role: 'client' }),
      headers: { Authorization: `Bearer ${siteToken}`, 'Content-Type': 'application/json', 'Accept-Language': 'ar' } });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.errors.code, 'admin_account');
    assert.match(body.message, /حساب إدارة/);
    const client = await fixture('client');
    await db.query("INSERT INTO requests (client_id, title, description, status) VALUES (?, 'طلب مفتوح', 'x', 'open')", [client.id]);
    const refused = await fetch(`${base}/users/me/role`, { method: 'PUT', body: JSON.stringify({ role: 'provider' }),
      headers: { Authorization: `Bearer ${token(client)}`, 'Content-Type': 'application/json' } });
    const refusedBody = await refused.json();
    assert.equal(refused.status, 409);
    assert.equal(refusedBody.errors.code, 'open_requests');
    assert.equal(refusedBody.errors.jobs[0].title, 'طلب مفتوح');
  });

  test('an open request is shown in the reader\'s language, from a saved translation (AYK-229)', async () => {
    const client = await fixture('client');
    const id = (await db.query("INSERT INTO requests (client_id, title, description, status) VALUES (?, 'تسريب مياه', 'في المطبخ', 'open')", [client.id])).insertId;
    const read = async lang => (await (await fetch(`${base}/requests/${id}/translation?lang=${lang}`, { headers: { Authorization: `Bearer ${token(client)}` } })).json()).data;
    const same = await read('ar');
    assert.equal(same.translated, false); assert.equal(same.title, 'تسريب مياه');
    await db.query("INSERT INTO request_translations (request_id, lang, source_lang, title, description, provider) VALUES (?, 'ur', 'ar', 'پانی کا رساؤ', 'باورچی خانے میں', 'test')", [id]);
    const ur = await read('ur');
    assert.equal(ur.translated, true); assert.equal(ur.title, 'پانی کا رساؤ'); assert.equal(ur.description, 'باورچی خانے میں');
    // The request page carries it already: no second request (AYK-231).
    const page = (await (await fetch(`${base}/requests/${id}?lang=ur`, { headers: { Authorization: `Bearer ${token(client)}` } })).json()).data;
    assert.equal(page.translation.title, 'پانی کا رساؤ');
    assert.equal((await fetch(`${base}/requests/${id}/translation?lang=xx`, { headers: { Authorization: `Bearer ${token(client)}` } })).status, 422);
  });

  test('chat translations come with the messages, in one batch, and only to the chat\'s people (AYK-231)', async () => {
    const one = await fixture('client'), two = await fixture('provider'), outsider = await fixture('client');
    const conv = await api('/chat/conversations', one, 201, 'POST', { user_id: two.id });
    const fd = new FormData(); fd.append('content', 'مرحبا كيف حالك'); fd.append('client_id', 'abc12345xyz');
    const response = await fetch(`${base}/chat/conversations/${conv.data.id}/messages`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${token(one)}` } });
    const sent = (await response.json()).data;
    assert.equal(response.status, 201);
    assert.equal(sent.client_id, 'abc12345xyz');
    await db.query("INSERT INTO message_translations (message_id, lang, source_lang, translated_text, same_language) VALUES (?, 'en', 'ar', 'Hello, how are you', 0)", [sent.id]);
    const list = await api(`/chat/conversations/${conv.data.id}/messages?lang=en`, two);
    assert.deepEqual(list.data.at(-1).translation, { lang: 'en', text: 'Hello, how are you', from: 'ar', same: false });
    // The sender's own messages carry no translation for them.
    assert.equal((await api(`/chat/conversations/${conv.data.id}/messages?lang=en`, one)).data.at(-1).translation, undefined);
    const batch = await api(`/chat/conversations/${conv.data.id}/translations`, two, 200, 'POST', { ids: [sent.id], lang: 'en' });
    assert.equal(batch.data[sent.id].text, 'Hello, how are you');
    await api(`/chat/conversations/${conv.data.id}/translations`, outsider, 403, 'POST', { ids: [sent.id], lang: 'en' });
    await api(`/chat/conversations/${conv.data.id}/translations`, two, 400, 'POST', { ids: [sent.id], lang: 'xx' });
    // Only what came after a message: the catch-up after a dropped connection.
    assert.deepEqual((await api(`/chat/conversations/${conv.data.id}/messages?after=${sent.id}`, two)).data, []);
    await api(`/chat/conversations/${conv.data.id}/messages?after=abc`, two, 400);
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
