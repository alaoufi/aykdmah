// This suite owns one random localhost database and never loads .env files.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const name = `ryza_test_chat_media_${crypto.randomBytes(8).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.RYZA_TEST_PORT || '55432', DB_NAME: name,
  DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
  NEON_DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_URL_NON_POOLING: '', PGHOST: '127.0.0.1',
  PGPORT: process.env.RYZA_TEST_PORT || '55432', PGDATABASE: name, PGUSER: 'postgres', PGPASSWORD: '', PGSSLMODE: 'disable',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_NAME: '', RESET_KEY: '',
  MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '', WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', GOOGLE_MAPS_API_KEY: '', SENDGRID_API_KEY: '', RESEND_API_KEY: '',
  TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', UNIFONIC_APP_SID: '', NAFATH_CLIENT_ID: '', NAFATH_CLIENT_SECRET: '',
  INTEGRATION_ENCRYPTION_KEY: '', NAFATH_ALLOWED_HOSTS: '', VERCEL: '', AUTO_MIGRATE: 'false', UPLOAD_STORAGE: 'database',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), CLIENT_URL: 'http://127.0.0.1', APP_URL: 'http://127.0.0.1',
});
const { Client } = require('pg');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('../config/database');
const jwt = require('../utils/jwt');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Setting = require('../models/Setting');
const { localeMiddleware, translate, SUPPORTED } = require('../utils/i18n');
const { MAX_FILES_BYTES } = require('../middleware/upload');
const fixtures = require('./fixtures/chat-media.json');
const nativeFetch = global.fetch;
const media = key => Buffer.from(fixtures[key], 'base64');
let server, base, conversation, users, created = false;
const maintenance = () => new Client({ host: '127.0.0.1', port: Number(process.env.RYZA_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false });

function form(bytes, filename, mime, fields = { message_type: 'file' }) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
  if (bytes) data.append('files', new Blob([bytes], { type: mime }), filename);
  return data;
}
async function call(path, { user, body, headers = {}, method = body ? 'POST' : 'GET' } = {}) {
  return nativeFetch(base + path, {
    method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...headers }, body,
  });
}
const send = (body, user = users.provider) => call(`/api/chat/conversations/${conversation}/messages`, { user, body });
async function count() { return Number((await db.queryOne('SELECT COUNT(*) AS n FROM uploaded_media')).n); }

test.before(async () => {
  const admin = maintenance(); await admin.connect();
  try { await admin.query(`CREATE DATABASE "${name}"`); created = true; } finally { await admin.end(); }
  const installed = await require('../services/installService').setupFromEnv();
  assert.equal(installed.migrations.flatMap(migration => migration.errors).length, 0);
  global.fetch = async () => { throw new Error('Outbound services are disabled in local media verification'); };
  users = {};
  for (const [key, role] of [['client', 'client'], ['provider', 'provider'], ['outsider', 'client']]) {
    const result = await db.query('INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [key, `${key}@test.invalid`, `+96650000000${Object.keys(users).length}`, 'unused-local-test-hash', role]);
    users[key] = { id: result.insertId, token: jwt.sign({ id: result.insertId, role, auth_version: 0 }) };
  }
  conversation = await Conversation.findOrCreateBetween(users.client.id, users.provider.id);
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use(localeMiddleware);
  app.use('/api/chat', require('../routes/chatRoutes')); app.use('/api/media', require('../routes/mediaRoutes'));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  global.fetch = nativeFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  await db.getPool().end();
  if (created) { const admin = maintenance(); await admin.connect(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } }
});

test('both browser voice containers and audio formats persist private bytes with bounded optional duration', async () => {
  for (const [filename, mime] of [['voice.webm', 'audio/webm;codecs=opus'], ['voice.m4a', 'audio/x-m4a'], ['voice.ogg', 'audio/ogg;codecs=opus'], ['voice.wav', 'audio/wav']]) {
    const response = await send(form(media(filename), filename, mime, { message_type: 'voice', duration_seconds: 60 }));
    assert.equal(response.status, 201, await response.clone().text());
    const message = (await response.json()).data;
    assert.equal(message.message_type, 'voice'); assert.equal(message.files[0].duration_seconds, 60);
    assert.equal(message.files[0].file_type, filename.endsWith('.m4a') ? 'audio/mp4' : mime.split(';')[0]);
    const url = message.files[0].file_url;
    assert.equal((await call(url)).status, 401);
    assert.equal((await call(url, { user: users.outsider })).status, 404);
    const download = await call(url, { headers: { Cookie: `token=${users.client.token}` } });
    assert.equal(download.status, 200); assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), media(filename));
  }
});

test('MP4/WebM/MOV/Ogg use the existing file message type and authenticated range playback', async () => {
  for (const [filename, mime] of [['video.mp4', 'video/mp4'], ['video.webm', 'video/webm'], ['video.mov', 'video/quicktime'], ['video.ogv', 'video/ogg']]) {
    const response = await send(form(media(filename), filename, mime));
    assert.equal(response.status, 201, await response.clone().text());
    const message = (await response.json()).data;
    assert.equal(message.message_type, 'file'); assert.equal(message.files[0].file_type, mime);
    assert.equal(message.files[0].duration_seconds, null);
    const playback = await call(message.files[0].file_url, { user: users.client, headers: { Range: 'bytes=4-15' } });
    assert.equal(playback.status, 206); assert.equal(playback.headers.get('content-type'), mime);
    assert.deepEqual(Buffer.from(await playback.arrayBuffer()), media(filename).subarray(4, 16));
    await Message.softDelete(message.id);
    assert.equal((await call(message.files[0].file_url, { user: users.provider })).status, 404);
  }
});

test('mobile octet-stream and omitted MIME headers preserve authoritative audio/video kinds', async () => {
  for (const [filename, expected] of [['video.mp4', 'video/mp4'], ['voice.m4a', 'audio/mp4'], ['voice.webm', 'audio/webm'], ['video.webm', 'video/webm'], ['video.ogv', 'video/ogg']]) {
    const accepted = await send(form(media(filename), filename, 'application/octet-stream'), users.client);
    assert.equal(accepted.status, 201, await accepted.clone().text());
    const message = (await accepted.json()).data;
    assert.equal(message.files[0].file_type, expected);
  }
  const before = await count();
  const boundary = `missing-mime-${crypto.randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="message_type"\r\n\r\nfile\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="fake.mp4"\r\n\r\n`),
    Buffer.from('<script>malicious</script>'), Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const rejected = await call(`/api/chat/conversations/${conversation}/messages`, { user: users.client, body, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } });
  assert.equal(rejected.status, 400);
  assert.equal(await count(), before);
});

test('unauthorized participants and current verification/block policies cannot persist media', async () => {
  const before = await count();
  assert.equal((await send(form(media('video.mp4'), 'video.mp4', 'video/mp4'), users.outsider)).status, 403);
  assert.equal((await call(`/api/chat/conversations/${conversation}/messages`, { body: form(media('voice.webm'), 'voice.webm', 'audio/webm') })).status, 401);
  await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [users.provider.id]);
  try { assert.equal((await send(form(media('voice.webm'), 'voice.webm', 'audio/webm', { message_type: 'voice' }))).status, 403); }
  finally { await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [users.provider.id]); }
  await Setting.set('verify_block_until_verified', 'true'); await Setting.set('verify_required_for_provider', 'sms');
  try { assert.equal((await send(form(media('video.mp4'), 'video.mp4', 'video/mp4'))).status, 403); }
  finally { await Setting.set('verify_block_until_verified', 'false'); }
  assert.equal(await count(), before);
});

test('spoofed containers, video disguised as voice and invalid durations fail before storage', async () => {
  const before = await count();
  const header = Buffer.alloc(16); header.writeUInt32BE(16); header.write('ftyp', 4); header.write('isom', 8);
  for (const body of [
    form(Buffer.from('<script>fake</script>'), 'fake.mp4', 'video/mp4'),
    form(header, 'header-only.mp4', 'video/mp4'),
    form(media('video.webm'), 'clip.webm', 'audio/webm', { message_type: 'voice' }),
    form(media('video.mp4'), 'clip.mp4', 'audio/mp4', { message_type: 'voice' }),
    form(media('voice.webm'), 'voice.webm', 'audio/webm', { message_type: 'voice', duration_seconds: '60.5' }),
    form(media('voice.webm'), 'voice.webm', 'audio/webm', { message_type: 'voice', duration_seconds: 601 }),
    form(media('video.mp4'), 'video.mp4', 'video/mp4', { message_type: 'system' }),
  ]) assert.equal((await send(body)).status, 400);
  assert.equal(await count(), before);
});

test('combined files remain under the Vercel body budget and failed message writes clean stored files', async () => {
  const before = await count();
  const oversized = Buffer.alloc(MAX_FILES_BYTES + 1); media('voice.webm').copy(oversized);
  assert.equal((await send(form(oversized, 'big.webm', 'audio/webm', { message_type: 'voice' }))).status, 413);
  const response = await send(form(media('video.mp4'), 'video.mp4', 'video/mp4', { message_type: 'file', reply_to_id: 999999 }));
  assert.equal(response.status, 400);
  assert.equal(await count(), before, 'Failed message transaction compensates uploaded-media persistence');
});

test('file validation errors use the reader language across all native locales', async () => {
  const before = await count();
  for (const language of SUPPORTED) {
    const response = await call(`/api/chat/conversations/${conversation}/messages`, {
      user: users.client, headers: { 'Accept-Language': language },
      body: form(Buffer.from('<script>fake</script>'), 'fake.mp4', 'video/mp4'),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, translate(language, 'file_content_invalid'));
  }
  assert.equal(await count(), before);
});
