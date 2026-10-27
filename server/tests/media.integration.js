// Optional destructive tests use only an explicitly named disposable LOCAL DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databaseName = process.env.AYK_MEDIA_TEST_DB;
if (!databaseName) {
  test('durable upload integration (set AYK_MEDIA_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_media[a-z0-9_]*$/.test(databaseName)) throw new Error('Use a disposable ayk_test_media* database.');
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '5432',
    DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_NAME: '',
    MAIL_USER: '', MAIL_PASSWORD: '', WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', PAYMENT_SECRET_KEY: '', PAYMENT_WEBHOOK_SECRET: '', PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '',
    UPLOAD_STORAGE: 'database', MAIL_HOST: '', PAYMENT_PROVIDER: '', AUTO_MIGRATE: 'false',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const express = require('express');
  const db = require('../config/database');
  const install = require('../services/installService');
  const Conversation = require('../models/Conversation');
  const UploadedMedia = require('../models/UploadedMedia');
  const { withUploadedFiles } = require('../utils/uploadPersistence');
  const { localeMiddleware } = require('../utils/i18n');
  const { errorHandler } = require('../middleware/errorHandler');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  let server, base, client, provider, outsider, request, conversationId;
  function startServer() {
    const app = express();
    app.use(express.json());
    app.use(localeMiddleware);
    app.use('/api/media', require('../routes/mediaRoutes'));
    app.use('/api', require('../routes'));
    app.use(errorHandler);
    server = app.listen(0);
    return new Promise(resolve => server.once('listening', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }));
  }
  async function call(path, { token, body, expected = 200, method = 'GET' } = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + '/api' + path, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  }
  function form(fields, files = []) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    for (const [field, bytes, filename, mime] of files) body.append(field, new Blob([bytes], { type: mime }), filename);
    return body;
  }
  async function countMedia() { return Number((await db.queryOne('SELECT COUNT(*) AS total FROM uploaded_media')).total); }
  test.before(async () => {
    const result = await install.setupFromEnv();
    assert.equal(result.migrations.flatMap(m => m.errors).length, 0);
    await startServer();
    const suffix = crypto.randomBytes(4).toString('hex');
    const register = (role, name) => call('/auth/register', { method: 'POST', expected: 201, body: { full_name: name, username: `${role}_${name}_${suffix}`, password: 'TestMediaOnly-2026', role } });
    client = await register('client', 'customer');
    provider = await register('provider', 'provider');
    outsider = await register('client', 'outsider');
  });
  test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.getPool().end(); });

  test('request attachments retain bytes across app restart and support range downloads', async () => {
    const pdf = Buffer.from('%PDF-1.4\nTest document');
    request = await call('/requests', {
      method: 'POST', expected: 201, token: client.token,
      body: form({ title: 'إصلاح تسريب في بريدة', description: 'اختبار المرفقات المحفوظة في قاعدة البيانات' }, [['files', png, 'leak.png', 'image/png'], ['files', pdf, 'notes.pdf', 'application/pdf']]),
    });
    assert.equal(request.files.length, 2);
    for (const file of request.files) assert.match(file.file_url, /^\/api\/media\/[a-f0-9-]{36}$/);
    await new Promise(resolve => server.close(resolve));
    db.resetPool();
    await startServer();
    assert.equal((await fetch(base + request.files[0].file_url)).status, 401);
    const fetched = await fetch(base + request.files[0].file_url, { headers: { Authorization: `Bearer ${client.token}` } });
    assert.equal(fetched.status, 200);
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), png);
    assert.match(fetched.headers.get('x-robots-tag'), /noindex/);
    assert.equal(fetched.headers.get('cache-control'), 'private, no-store');
    const partial = await fetch(base + request.files[0].file_url, { headers: { Range: 'bytes=1-6', Authorization: `Bearer ${client.token}` } });
    assert.equal(partial.status, 206);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), png.subarray(1, 7));
    const invalid = await fetch(base + request.files[0].file_url, { headers: { Range: 'bytes=9999-', Authorization: `Bearer ${client.token}` } });
    assert.equal(invalid.status, 416);
    const document = await fetch(base + request.files[1].file_url, { headers: { Authorization: `Bearer ${client.token}` } });
    assert.deepEqual(Buffer.from(await document.arrayBuffer()), pdf);
    assert.match(document.headers.get('content-disposition'), /attachment/);
    assert.equal((await fetch(base + '/api/media/1')).status, 404);
  });

  test('chat authorization occurs before storage; authorized files and notification persist', async () => {
    await db.query("UPDATE requests SET status = 'assigned', assigned_provider_id = ? WHERE id = ?", [provider.user.id, request.id]);
    conversationId = await Conversation.findOrCreateBetween(client.user.id, provider.user.id, request.id);
    let before = await countMedia();
    await call(`/chat/conversations/${conversationId}/messages`, { method: 'POST', expected: 403, token: outsider.token, body: form({ message_type: 'image' }, [['files', png, 'private.png', 'image/png']]) });
    assert.equal(await countMedia(), before);
    const message = await call(`/chat/conversations/${conversationId}/messages`, { method: 'POST', expected: 201, token: provider.token, body: form({ message_type: 'image' }, [['files', png, 'private.png', 'image/png']]) });
    assert.equal(message.files.length, 1);
    const media = await fetch(base + message.files[0].file_url, { headers: { Authorization: `Bearer ${client.token}` } });
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), png);
    assert.ok(await db.queryOne("SELECT id FROM notifications WHERE user_id = ? AND type = 'new_message'", [client.user.id]));
  });

  test('review images and dispute evidence save persistently; failed batches leave no orphan media', async () => {
    await db.query("UPDATE requests SET status = 'completed', assigned_provider_id = ? WHERE id = ?", [provider.user.id, request.id]);
    const review = await call('/reviews', { method: 'POST', expected: 201, token: client.token, body: form({ request_id: request.id, rating: 5, comment: 'تقييم اختبار' }, [['images', png, 'work.png', 'image/png']]) });
    assert.equal(review.images.length, 1);
    assert.deepEqual(Buffer.from(await (await fetch(base + review.images[0])).arrayBuffer()), png);
    const dispute = await call('/disputes', { method: 'POST', expected: 201, token: client.token, body: { request_id: request.id, subject: 'اختبار حفظ الأدلة', description: 'اختبار محلي' } });
    const evidence = await call(`/disputes/${dispute.id}/evidence`, { method: 'POST', expected: 201, token: provider.token, body: form({ caption: 'صورة توضيحية' }, [['files', png, 'evidence.png', 'image/png']]) });
    assert.equal(evidence.length, 1);
    assert.equal((await fetch(base + evidence[0].file_url)).status, 401);
    assert.equal((await fetch(base + evidence[0].file_url, { headers: { Authorization: `Bearer ${outsider.token}` } })).status, 404);
    assert.deepEqual(Buffer.from(await (await fetch(base + evidence[0].file_url, { headers: { Authorization: `Bearer ${provider.token}` } })).arrayBuffer()), png);
    const before = await countMedia();
    await call(`/disputes/${dispute.id}/evidence`, { method: 'POST', expected: 422, token: provider.token, body: form({ caption: 'x'.repeat(301) }, [['files', png, 'first.png', 'image/png'], ['files', png, 'second.png', 'image/png']]) });
    assert.equal(await countMedia(), before);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM dispute_evidence WHERE dispute_id = ?', [dispute.id])).total), 1);
    await call(`/disputes/${dispute.id}/evidence`, { method: 'POST', expected: 403, token: outsider.token, body: form({}, [['files', png, 'forbidden.png', 'image/png']]) });
    assert.equal(await countMedia(), before);
  });

  test('combined upload budget, disallowed MIME and failed domain write do not persist media', async () => {
    const before = await countMedia();
    const fields = { title: 'طلب اختبار الحجم', description: 'اختبار رفع ملفات كبيرة مجتمعة' };
    const big = Buffer.alloc(1990000, 1);
    await call('/requests', { method: 'POST', expected: 413, token: client.token, body: form(fields, [['files', big, 'one.png', 'image/png'], ['files', big, 'two.png', 'image/png']]) });
    await call('/requests', { method: 'POST', expected: 400, token: client.token, body: form(fields, [['files', png, 'unsafe.exe', 'image/png']]) });
    await call('/requests', { method: 'POST', expected: 422, token: client.token, body: form({ ...fields, category_id: 999999999 }, [['files', png, 'rollback.png', 'image/png']]) });
    assert.equal(await countMedia(), before);
    await assert.rejects(withUploadedFiles([{ originalname: 'rollback.png', mimetype: 'image/png', buffer: png }], { ownerId: client.user.id, scope: 'avatars' }, () => { throw new Error('domain rollback'); }), /domain rollback/);
    assert.equal(await countMedia(), before);
    await assert.rejects(UploadedMedia.createBatch([{ originalname: 'first.png', mimetype: 'image/png', buffer: png }, { originalname: 'empty.png', mimetype: 'image/png', buffer: Buffer.alloc(0) }], { ownerId: client.user.id, scope: 'avatars' }));
    assert.equal(await countMedia(), before, 'asset batch rolls back if a later asset is invalid');
  });
}
