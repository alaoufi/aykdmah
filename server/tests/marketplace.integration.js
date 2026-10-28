// Set AYK_TEST_DB to a disposable localhost database whose name starts ayk_test.
// This suite never connects to the configured application database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databaseName = process.env.AYK_TEST_DB;
if (!databaseName) {
  test('PostgreSQL marketplace integration (set AYK_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test[a-z0-9_]*$/.test(databaseName)) throw new Error('Use a disposable ayk_test* database.');
  Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '5432', DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false', MAIL_HOST: '', PAYMENT_PROVIDER: '', JWT_SECRET: crypto.randomBytes(48).toString('hex') });
  const db = require('../config/database');
  const install = require('../services/installService');
  const Request = require('../models/Request');
  const Offer = require('../models/Offer');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const Setting = require('../models/Setting');
  let server, base;
  test.before(async () => {
    const result = await install.setupFromEnv();
    assert.equal(result.migrations.flatMap(m => m.errors).length, 0);
    assert.equal(Number((await db.queryOne("SELECT COUNT(*) AS count FROM users WHERE role='admin'")).count), 0, 'No known-password admin is seeded');
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.getPool().end(); });
  async function api(path, { token, body, method = 'GET', expected = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    assert.equal(response.status, expected, data.message);
    return data;
  }
  test('client and provider share a password and unverified raw badge flags grant no paid badges', async () => {
    const suffix = crypto.randomBytes(5).toString('hex');
    const password = `SharedLocalTest-${suffix}`;
    let providerToken, providerId;
    for (const role of ['client', 'provider']) {
      const username = `${role}_shared_${suffix}`;
      const registered = (await api('/auth/register', {
        method: 'POST', expected: 201,
        body: { full_name: `${role} account test`, username, password, role },
      })).data;
      const loggedIn = (await api('/auth/login', {
        method: 'POST', body: { identifier: username, password },
      })).data;
      assert.equal(loggedIn.user.role, role);
      assert.equal(loggedIn.user.id, registered.user.id);
      const account = (await api('/auth/me', { token: loggedIn.token })).data;
      assert.equal(account.user.role, role);
      assert.equal(account.user.id, registered.user.id);
      if (role === 'client') {
        assert.equal(account.provider, null);
      } else {
        providerToken = loggedIn.token;
        providerId = loggedIn.user.id;
        assert.equal(account.provider.is_trusted, false);
        assert.equal(account.provider.is_featured_badge, false);
      }
    }
    const assertBadges = async (expected) => {
      const account = (await api('/auth/me', { token: providerToken })).data;
      assert.equal(account.user.role, 'provider');
      assert.equal(account.provider.is_trusted, expected);
      assert.equal(account.provider.is_featured_badge, expected);
    };
    await db.query(`UPDATE provider_profiles
      SET badge_trusted_active = 1, badge_featured_active = 1,
          badge_trusted_until = CURRENT_TIMESTAMP + INTERVAL '1 day',
          badge_featured_until = NULL WHERE user_id = ?`, [providerId]);
    await assertBadges(false);
    await db.query(`UPDATE provider_profiles
      SET badge_trusted_until = NULL,
          badge_featured_until = CURRENT_TIMESTAMP + INTERVAL '1 day'
      WHERE user_id = ?`, [providerId]);
    await assertBadges(false);
    await db.query(`UPDATE provider_profiles
      SET badge_trusted_until = CURRENT_TIMESTAMP - INTERVAL '1 day',
          badge_featured_until = CURRENT_TIMESTAMP - INTERVAL '1 day'
      WHERE user_id = ?`, [providerId]);
    await assertBadges(false);
  });
  test('registration without email, nearby matching, offer acceptance, chat and request completion', async () => {
    const suffix = crypto.randomBytes(5).toString('hex');
    const customer = (await api('/auth/register', { method: 'POST', expected: 201, body: { full_name: 'عميل الاختبار', username: `customer_${suffix}`, password: 'AykTestOnly-2026', role: 'client' } })).data;
    const provider = (await api('/auth/register', { method: 'POST', expected: 201, body: { full_name: 'عامل الاختبار', username: `provider_${suffix}`, password: 'AykTestOnly-2026', role: 'provider' } })).data;
    // Empty or short texts are accepted; a plain title and description are filled in.
    const blank = (await api('/requests', { method: 'POST', token: customer.token, body: { title: '', description: '' }, expected: 201 })).data;
    assert.equal(blank.title, 'طلب خدمة');
    assert.equal(blank.description, 'طلب خدمة');
    const short = (await api('/requests', { method: 'POST', token: customer.token, body: { description: 'مكيف' }, expected: 201 })).data;
    assert.equal(short.title, 'مكيف');
    await api(`/requests/${blank.id}`, { method: 'DELETE', token: customer.token });
    await api(`/requests/${short.id}`, { method: 'DELETE', token: customer.token });
    const request = (await api('/requests', { method: 'POST', token: customer.token, expected: 201, body: { title: 'إصلاح تسريب في بريدة', description: 'تسريب تحت حوض المطبخ يحتاج صيانة', address: 'بريدة، حي الريان', latitude: 26.326, longitude: 43.975 } })).data;
    const nearby = await api('/requests/nearby?latitude=26.326&longitude=43.975&radius=5');
    assert.ok(nearby.data.some(item => Number(item.id) === Number(request.id)));
    const far = await api('/requests/nearby?latitude=24.7136&longitude=46.6753&radius=5');
    assert.ok(!far.data.some(item => Number(item.id) === Number(request.id)));
    const offer = (await api('/offers', { method: 'POST', token: provider.token, expected: 201, body: { request_id: request.id, price: '١٠٠', message: 'عرض تجريبي لاختبار التدفق' } })).data;
    assert.equal(Number(offer.price), 100, 'a price typed in Arabic digits is accepted');
    const offers = await api(`/offers/request/${request.id}`, { token: customer.token });
    assert.ok(offers.data.some(item => Number(item.id) === Number(offer.id)));
    await api(`/offers/${offer.id}/accept`, { method: 'PUT', token: customer.token });
    await assert.rejects(Offer.acceptOffer(offer.id), /لم يعد/);
    const assigned = (await api(`/requests/${request.id}`, { token: customer.token })).data;
    assert.equal(assigned.status, 'assigned');
    assert.equal(Number(assigned.assigned_provider_id), Number(provider.user.id));
    const conversationId = await Conversation.findOrCreateBetween(customer.user.id, provider.user.id, request.id);
    const conversations = (await api('/chat/conversations', { token: customer.token })).data;
    assert.ok(conversations.some(item => Number(item.id) === Number(conversationId)));
    await api(`/chat/conversations/${conversationId}/messages`, { method: 'POST', token: provider.token, expected: 201, body: { content: 'موعدنا غدًا بعد العصر' } });
    const messages = (await api(`/chat/conversations/${conversationId}/messages`, { token: customer.token })).data;
    assert.equal(messages[0].content, 'موعدنا غدًا بعد العصر');
    // Only the author deletes a message; it disappears for both, and administrators keep it.
    const extra = (await api(`/chat/conversations/${conversationId}/messages`, { method: 'POST', token: provider.token, expected: 201, body: { content: 'رسالة ستحذف' } })).data;
    await api(`/chat/conversations/${conversationId}/messages/${extra.id}`, { method: 'DELETE', token: customer.token, expected: 403 });
    await api(`/chat/conversations/${conversationId}/messages/${extra.id}`, { method: 'DELETE', token: provider.token });
    for (const token of [customer.token, provider.token]) {
      assert.ok(!(await api(`/chat/conversations/${conversationId}/messages`, { token })).data.some(m => m.id === extra.id), 'gone for both participants');
    }
    const kept = (await Message.listByConversation(conversationId, { includeDeleted: true })).find(m => m.id === extra.id);
    assert.ok(kept?.deleted_at && kept.content === 'رسالة ستحذف', 'kept for administrators with its deletion time');
    await api(`/requests/${request.id}/status`, { method: 'PUT', token: provider.token, body: { status: 'in_progress' } });
    await api(`/requests/${request.id}/status`, { method: 'PUT', token: customer.token, body: { status: 'completed' } });
    assert.equal((await api(`/requests/${request.id}`, { token: customer.token })).data.status, 'completed');
    const file = { file_url: '/uploads/test.pdf', file_name: 'test.pdf', file_type: 'application/pdf', file_size: 10 };
    const attachedRequestId = await Request.create({ client_id: customer.user.id, title: 'طلب مرفق', description: 'اختبار حفظ الملف مع الطلب', files: [file] });
    assert.equal((await Request.findById(attachedRequestId)).files.length, 1);
    const messageId = await Message.create({ conversation_id: conversationId, sender_id: customer.user.id, files: [file], message_type: 'file' });
    assert.equal((await Message.findById(messageId)).files.length, 1);
  });
  test('search-engine pages carry their own title, canonical, structured data and text; the sitemap lists them', async () => {
    const shell = require('path').join(require('os').tmpdir(), `ayk-seo-${crypto.randomBytes(4).toString('hex')}.html`);
    require('fs').writeFileSync(shell, '<!doctype html><html><head><meta name="description" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><title>x</title></head><body><div id="root"></div></body></html>');
    process.env.SEO_INDEX_HTML = shell;
    const service = await db.queryOne('SELECT id, name_ar FROM services WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1');
    const category = await db.queryOne('SELECT slug, name_ar FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1');
    const page = async p => { const r = await fetch(`${base}/seo/page${p}`); return { status: r.status, html: await r.text() }; };

    const home = await page('/');
    assert.equal(home.status, 200);
    assert.match(home.html, /<title>أي خدمة \| صيانة منزلية/);
    assert.match(home.html, /<link rel="canonical" href="https:\/\/aykdmh.com\/" \/>/);
    assert.match(home.html, /"@type":"WebSite"/);
    assert.ok(home.html.includes(`href="/services/${service.id}"`), 'home links every service');

    const one = await page(`/services/${service.id}`);
    assert.equal(one.status, 200);
    assert.ok(one.html.includes(`<title>${service.name_ar}`), 'service title');
    assert.ok(one.html.includes(`<h1>${service.name_ar}</h1>`), 'readable heading without JavaScript');
    assert.match(one.html, /"@type":"Service"/);
    assert.match(one.html, /"@type":"BreadcrumbList"/);
    assert.equal((await page(`/services/category/${category.slug}`)).status, 200);

    const missing = await page('/services/999999999');
    assert.equal(missing.status, 404);
    assert.match(missing.html, /noindex/);
    const sitemap = await fetch(`${base}/seo/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.ok(xml.includes(`<loc>https://aykdmh.com/services/${service.id}</loc>`));
    assert.ok(xml.includes(`<loc>https://aykdmh.com/services/category/${category.slug}</loc>`));
    require('fs').unlinkSync(shell);
  });
  test('search-engine text is escaped', () => {
    const seo = require('../services/seoService');
    const html = seo.render({ title: '<b>t</b>', description: '"d"', path: '/x', ld: [{ name: '</script><script>alert(1)</script>' }], body: '<h1>ok</h1>' });
    assert.ok(html, 'the app shell is cached from the previous test');
    assert.ok(html.includes('<title>&lt;b&gt;t&lt;/b&gt;</title>'), 'title is escaped');
    assert.ok(!html.includes('</script><script>alert(1)'), 'JSON-LD cannot close its script tag');
  });
  test('a failed transaction rolls back every write', async () => {
    await assert.rejects(db.transaction(async conn => {
      await conn.execute("INSERT INTO settings (setting_key, setting_value) VALUES ('rollback_probe', 'value')");
      throw new Error('forced rollback');
    }), /forced rollback/);
    assert.equal(await Setting.get('rollback_probe'), null);
  });
  test('settings upsert works and migrations do not reset administrator permissions or edited settings', async () => {
    await Setting.set('review_probe', 'first');
    await Setting.set('review_probe', 'second');
    const admin = await db.query(`INSERT INTO users (full_name, email, password_hash, role, is_super_admin, permissions)
      VALUES (?, ?, ?, 'admin', 0, ?)`, ['Restricted test admin', 'restricted@ayk-test.local', 'not-a-login-hash', '["requests"]']);
    try {
      const result = await install.runMigrationsFromEnv();
      assert.equal(result.applied.length, 0);
      assert.equal(await Setting.get('review_probe'), 'second');
      const row = await db.queryOne('SELECT is_super_admin, permissions FROM users WHERE id = ?', [admin.insertId]);
      assert.equal(row.is_super_admin, 0);
      assert.deepEqual(row.permissions, ['requests']);
    } finally { await db.query('DELETE FROM users WHERE id = ?', [admin.insertId]); }
  });
}
