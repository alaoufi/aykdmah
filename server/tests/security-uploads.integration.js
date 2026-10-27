// Each invocation creates and drops only its own random local PostgreSQL DB.
// No provider requests, messages, production credentials, env files, or locks.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const databaseName = `ayk_test_security_uploads_${crypto.randomBytes(8).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432', DB_NAME: databaseName,
  DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
  POSTGRES_URL: '', POSTGRES_URL_NON_POOLING: '', PGHOST: '127.0.0.1', PGPORT: process.env.AYK_TEST_PORT || '55432',
  PGDATABASE: databaseName, PGUSER: 'postgres', PGPASSWORD: '', PGSSLMODE: 'disable',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_NAME: '', RESET_KEY: '',
  MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '', WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', GOOGLE_MAPS_API_KEY: '', SENDGRID_API_KEY: '', RESEND_API_KEY: '',
  TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', UNIFONIC_APP_SID: '', NAFATH_CLIENT_ID: '', NAFATH_CLIENT_SECRET: '',
  INTEGRATION_ENCRYPTION_KEY: '', NAFATH_ALLOWED_HOSTS: '', AUTO_MIGRATE: 'false', UPLOAD_STORAGE: 'database',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), CLIENT_URL: 'http://127.0.0.1', APP_URL: 'http://127.0.0.1',
});
const { Client } = require('pg');
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('node:http');
const db = require('../config/database');
const jwt = require('../utils/jwt');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const UploadedMedia = require('../models/UploadedMedia');
const UserVerification = require('../models/UserVerification');
const Notification = require('../models/Notification');
const Setting = require('../models/Setting');
const ApiIntegration = require('../models/ApiIntegration');
const verification = require('../services/verificationService');
const integrations = require('../services/integrations');
const { validateUpload } = require('../utils/uploadValidation');
const { allowedGatewayUrl, isPublicAddress, gatewayRequest } = require('../utils/integrationHttp');
const { emitConversation } = require('../utils/conversationEvents');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { AuthRateLimitStore } = require('../middleware/rateLimiter');
const { consumeSocketWrite, LIMITS: SOCKET_WRITE_LIMITS } = require('../utils/socketWriteLimiter');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const nativeFetch = global.fetch;
let server, io, base, createdDatabase = false;
let users, conversation, privateConversation, linkedConversation, requestId;
const sockets = [];

// The vulnerable baseline commit only exists in the original local history (not in the
// recovered source). Without it, run every assertion against the fixed code and skip the
// "baseline was vulnerable" demonstrations.
const HAS_BASELINE = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', '7f4ec4b^{commit}'], { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' });
    return true;
  } catch { return false; }
})();
if (!HAS_BASELINE) console.log('# baseline commit 7f4ec4b unavailable; vulnerable-baseline demonstrations skipped');

function baseline(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const source = execFileSync('git', ['show', `7f4ec4b:server/${relative}`], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
}

async function request(route, { user, token = user?.token, method = 'GET', body, headers = {} } = {}) {
  const multipart = body instanceof FormData;
  const response = await nativeFetch(base + route, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  return response;
}
function attachment(bytes = png, filename = 'image.png', mime = 'image/png', fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append('files', new Blob([bytes], { type: mime }), filename);
  return form;
}
async function mediaCount() { return Number((await db.queryOne('SELECT COUNT(*) AS n FROM uploaded_media')).n); }
async function socketFor(user) {
  const { io: connect } = require('../../client/node_modules/socket.io-client');
  const socket = connect(base, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  // Registration is asynchronous after the handshake; confirm handler readiness.
  await new Promise(resolve => setTimeout(resolve, 50));
  return socket;
}
function acknowledge(socket, event, payload) {
  return new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
}
async function noEvent(socket, event, trigger) {
  let received = false;
  const listener = () => { received = true; };
  socket.on(event, listener);
  await trigger();
  await new Promise(resolve => setTimeout(resolve, 150));
  socket.off(event, listener);
  assert.equal(received, false, `Unexpected ${event} disclosure`);
}

test.before(async () => {
  const admin = new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  await admin.end();
  await require('../services/installService').setupFromEnv();
  global.fetch = async () => { throw new Error('Outbound provider requests are disabled in this suite'); };
  users = {};
  for (const [name, role] of [['client', 'client'], ['provider', 'provider'], ['outsider', 'client'], ['other', 'provider']]) {
    const row = await db.query(`INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)`, [name, `${name}@test.invalid`, `+96650000000${Object.keys(users).length}`, 'unused-local-test-hash', role]);
    users[name] = { id: row.insertId, full_name: name, role, email: `${name}@test.invalid`, phone: `+96650000000${Object.keys(users).length}`, token: jwt.sign({ id: row.insertId, role, auth_version: 0 }) };
  }
  conversation = await Conversation.findOrCreateBetween(users.client.id, users.provider.id);
  privateConversation = await Conversation.findOrCreateBetween(users.outsider.id, users.other.id);
  const r = await db.query("INSERT INTO requests (client_id, title, description, assigned_provider_id, status) VALUES (?, ?, ?, ?, 'assigned')", [users.client.id, 'Local upload audit', 'Local private request', users.provider.id]);
  requestId = r.insertId;
  linkedConversation = await Conversation.findOrCreateBetween(users.client.id, users.provider.id, requestId);

  const app = express();
  app.use(express.json()); app.use(cookieParser());
  app.use((req, _res, next) => { req.t = key => key; next(); });
  app.use('/api/media', require('../routes/mediaRoutes'));
  app.use('/api/chat', require('../routes/chatRoutes'));
  app.use('/api/notifications', require('../routes/notificationRoutes'));
  app.use('/api/verify', require('../routes/verificationRoutes'));
  if (HAS_BASELINE) {
    app.use('/baseline/media', baseline('routes/mediaRoutes.js'));
    app.post('/baseline/upload', baseline('middleware/upload.js').uploadChat.array('files', 4), (req, res) => res.json({ accepted: !!req.files?.[0]?.buffer }));
  }
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message }));
  server = http.createServer(app);
  io = require('../socket')(server); app.set('io', io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  global.fetch = nativeFetch;
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise(resolve => io.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  // Socket disconnect handlers complete their local presence writes asynchronously.
  await new Promise(resolve => setTimeout(resolve, 150));
  await db.getPool().end();
  if (createdDatabase) {
    const admin = new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false });
    await admin.connect();
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  }
});

test('baseline proves anonymous private-media disclosure; fixed route enforces current participants and revocation', async () => {
  const id = await withUploadedFiles([{ originalname: 'private.png', mimetype: 'image/png', buffer: Buffer.from(png) }], { ownerId: users.client.id, scope: 'chat', scopeId: conversation }, files => Message.create({ conversation_id: conversation, sender_id: users.client.id, message_type: 'image', files }));
  const message = await Message.findById(id), url = message.files[0].file_url;
  if (HAS_BASELINE) {
    const baselineResponse = await request(url.replace('/api/media', '/baseline/media'));
    assert.equal(baselineResponse.status, 200);
    assert.deepEqual(Buffer.from(await baselineResponse.arrayBuffer()), png);
  }
  assert.equal((await request(url)).status, 401);
  assert.equal((await request(url, { user: users.outsider })).status, 404);
  const permitted = await request(url, { user: users.provider, headers: { Range: 'bytes=1-6' } });
  assert.equal(permitted.status, 206);
  assert.deepEqual(Buffer.from(await permitted.arrayBuffer()), png.subarray(1, 7));
  assert.equal((await request(url, { headers: { Cookie: `token=${users.provider.token}` } })).status, 200);
  await Message.softDelete(id);
  assert.equal((await request(url, { user: users.client })).status, 404);
  assert.equal((await Conversation.listForUser(users.client.id)).find(c => c.id === conversation).last_message, null);
});

test('content sniffing rejects spoofed HTML/executables and mismatched extensions before persistence', async () => {
  const evil = Buffer.from('<script>globalThis.executable=true</script>');
  if (HAS_BASELINE) assert.equal((await (await request('/baseline/upload', { method: 'POST', body: attachment(evil) })).json()).accepted, true);
  const count = await mediaCount();
  for (const [bytes, filename, mime] of [[evil, 'fake.png', 'image/png'], [Buffer.from('MZ executable'), 'fake.jpg', 'image/jpeg'], [png, 'fake.mp3', 'image/png'], [png, 'script.html', 'image/png']]) {
    assert.equal((await request(`/api/chat/conversations/${conversation}/messages`, { method: 'POST', user: users.client, body: attachment(bytes, filename, mime, { message_type: 'image' }) })).status, 400);
  }
  assert.equal(await mediaCount(), count);
  const safe = await request(`/api/chat/conversations/${conversation}/messages`, { method: 'POST', user: users.client, body: attachment(png, '../../safe.png', 'image/png', { message_type: 'image' }) });
  assert.equal(safe.status, 201);
  assert.equal((await safe.json()).data.files[0].file_name, 'safe.png');
  const before = await mediaCount();
  await assert.rejects(withUploadedFiles([{ originalname: 'rollback.png', mimetype: 'image/png', buffer: Buffer.from(png) }], { ownerId: users.client.id, scope: 'chat', scopeId: conversation }, () => { throw new Error('expected rollback'); }), /expected rollback/);
  assert.equal(await mediaCount(), before);
  assert.throws(() => validateUpload({ originalname: 'fake.pdf', mimetype: 'application/pdf', buffer: evil }));
});

test('baseline proves reply cross-conversation leak; fixed creation and historic reply joins isolate content', async () => {
  const secret = await Message.create({ conversation_id: privateConversation, sender_id: users.outsider.id, content: 'PRIVATE_ONLY_REPLY_CONTENT' });
  if (HAS_BASELINE) {
    const oldMessage = baseline('models/Message.js');
    const unsafe = await oldMessage.create({ conversation_id: conversation, sender_id: users.client.id, content: 'reply', reply_to_id: secret });
    assert.equal((await oldMessage.findById(unsafe)).reply_content, 'PRIVATE_ONLY_REPLY_CONTENT');
    assert.equal((await Message.findById(unsafe)).reply_content, null);
  }
  await assert.rejects(Message.create({ conversation_id: conversation, sender_id: users.client.id, content: 'reply', reply_to_id: secret }), /Invalid reply/);
  assert.equal((await request(`/api/chat/conversations/${conversation}/messages/${secret}`, { method: 'DELETE', user: users.outsider })).status, 403);
});

test('request-linked conversations permit only actual current order parties and serialize duplicate creation', async () => {
  await assert.rejects(Conversation.findOrCreateBetween(users.outsider.id, users.provider.id, requestId), /Forbidden request/);
  const results = await Promise.all(Array.from({ length: 6 }, () => Conversation.findOrCreateBetween(users.client.id, users.provider.id, requestId)));
  assert.deepEqual([...new Set(results)], [linkedConversation]);
  await db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [linkedConversation, users.outsider.id]);
  assert.equal(await Conversation.isParticipant(linkedConversation, users.outsider.id), false);
  assert.equal((await Conversation.getParticipants(linkedConversation)).some(p => p.id === users.outsider.id), false);
});

test('notification read and bulk read cannot mutate another user notifications', async () => {
  const own = await Notification.create({ user_id: users.client.id, type: 'new_message', title: 'own' });
  const other = await Notification.create({ user_id: users.outsider.id, type: 'new_message', title: 'other' });
  assert.equal((await request(`/api/notifications/${other.id}/read`, { user: users.client, method: 'PUT' })).status, 200);
  assert.equal(Number((await db.queryOne('SELECT is_read FROM notifications WHERE id = ?', [other.id])).is_read), 0);
  assert.equal((await request('/api/notifications/read-all', { user: users.client, method: 'PUT' })).status, 200);
  assert.equal(Number((await db.queryOne('SELECT is_read FROM notifications WHERE id = ?', [own.id])).is_read), 1);
  assert.equal(Number((await db.queryOne('SELECT is_read FROM notifications WHERE id = ?', [other.id])).is_read), 0);
});

test('baseline Nafath can approve invented transactions; fixed policy and transaction binding reject them without outbound calls', async () => {
  const integration = await ApiIntegration.create({ type: 'nafath', provider: 'mock', is_enabled: 1, credentials: null });
  if (HAS_BASELINE) {
    const oldVerification = baseline('services/verificationService.js');
    const approved = await oldVerification.pollNafath({ user: users.outsider, transactionId: 'unowned-invented-transaction' });
    assert.equal(approved.verified, true);
    assert.equal(Number((await db.queryOne('SELECT is_verified FROM users WHERE id = ?', [users.outsider.id])).is_verified), 1);
    await db.query('UPDATE users SET is_verified = 0 WHERE id = ?', [users.outsider.id]);
  }
  assert.equal((await verification.pollNafath({ user: users.outsider, transactionId: 'anything' })).error, 'method_disabled');
  await Setting.set('verify_methods_enabled', 'sms,email,nafath');
  assert.equal((await verification.pollNafath({ user: users.outsider, transactionId: 'anything' })).error, 'invalid_transaction');
  const started = await request('/api/verify/nafath/start', { method: 'POST', user: users.client, body: { national_id: '1000000000' } });
  assert.equal(started.status, 200);
  const transaction = (await started.json()).data;
  assert.equal((await verification.pollNafath({ user: users.outsider, transactionId: transaction.transactionId })).error, 'invalid_transaction');
  const confirmed = await verification.pollNafath({ user: users.client, transactionId: transaction.transactionId });
  assert.deepEqual(confirmed, { ok: true, verified: true });
  assert.equal((await verification.pollNafath({ user: users.client, transactionId: transaction.transactionId })).error, 'invalid_transaction');
  await ApiIntegration.remove(integration.id);
  await Setting.set('verify_methods_enabled', 'sms,email');
});

test('OTP attempts/consumption and resend serialize; account verification binds to the stored contact', async () => {
  assert.equal((await verification.startOtp({ user: users.client, method: 'sms', identifier: users.outsider.phone })).error, 'invalid_identifier');
  if (HAS_BASELINE) {
    const old = baseline('models/UserVerification.js');
    await old.createOtp({ user_id: users.provider.id, method: 'email', identifier: users.provider.email, code: '654321', maxAttempts: 3 });
    const insecure = await Promise.all(Array.from({ length: 6 }, () => old.verifyOtp(users.provider.id, 'email', '654321')));
    assert.ok(insecure.filter(r => r.ok).length > 1, 'Baseline concurrent consumers replay the same OTP');
    await db.query("DELETE FROM verification_otps WHERE user_id = ? AND method = 'email'", [users.provider.id]);
  }
  await UserVerification.createOtp({ user_id: users.provider.id, method: 'email', identifier: users.provider.email, code: '654321', maxAttempts: 3 });
  const attempts = await Promise.all(Array.from({ length: 8 }, () => UserVerification.verifyOtp(users.provider.id, 'email', '000000')));
  assert.equal(attempts.filter(r => r.reason === 'invalid_code').length, 3);
  assert.equal((await UserVerification.verifyOtp(users.provider.id, 'email', '654321')).ok, false);
  await db.query("DELETE FROM verification_otps WHERE user_id = ? AND method = 'email'", [users.provider.id]);
  const resent = await Promise.allSettled(Array.from({ length: 4 }, () => UserVerification.createOtp({ user_id: users.provider.id, method: 'email', identifier: users.provider.email, code: '123456' })));
  assert.equal(resent.filter(r => r.status === 'fulfilled').length, 1);
  const confirmed = await Promise.all(Array.from({ length: 6 }, () => UserVerification.verifyOtp(users.provider.id, 'email', '123456')));
  assert.equal(confirmed.filter(r => r.ok).length, 1);
  await UserVerification.createOtp({ user_id: users.provider.id, method: 'sms', identifier: users.outsider.phone, code: '112233' });
  assert.equal((await verification.confirmOtp({ user: users.provider, method: 'sms', code: '112233' })).reason, 'invalid_identifier');
  assert.equal(Number((await db.queryOne('SELECT is_verified FROM users WHERE id = ?', [users.provider.id])).is_verified), 0);
});

test('gateway validation blocks SSRF literals/private DNS and production fake adapters; no OTP/credentials logging', async () => {
  const blockedFetch = global.fetch, attempted = [];
  global.fetch = async (url, options) => {
    attempted.push({ url, headers: options.headers });
    return { ok: true, json: async () => ({ transactionId: 'local-only-provider-spy', code: '12' }) };
  };
  if (HAS_BASELINE) try {
    await baseline('services/integrations/nafath.js').nafath_api.start({ credentials: { base_url: 'http://127.0.0.1:9', client_id: 'LOCAL_TEST_ID', client_secret: 'LOCAL_TEST_SECRET' }, nationalId: '1000000000' });
    assert.equal(attempted[0].url, 'http://127.0.0.1:9/identity/start');
    assert.equal(attempted[0].headers['X-Client-Secret'], 'LOCAL_TEST_SECRET');
  } finally { global.fetch = blockedFetch; }
  process.env.NAFATH_ALLOWED_HOSTS = 'nafath.test.invalid,localhost';
  for (const endpoint of ['http://nafath.test.invalid', 'https://127.0.0.1', 'https://[::1]', 'https://allowed@nafath.test.invalid', 'https://nafath.test.invalid:8443', 'https://unallowed.test.invalid']) assert.throws(() => allowedGatewayUrl(endpoint));
  for (const ip of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '100.64.0.1', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  await assert.rejects(gatewayRequest('https://localhost', '/identity/start'), /unavailable/);
  process.env.NODE_ENV = 'production';
  assert.equal(integrations.getAdapter('nafath', 'mock'), null);
  assert.equal(integrations.getAdapter('sms', 'console'), null);
  assert.equal(integrations.getAdapter('__proto__', 'toString'), null);
  assert.equal(integrations.listAdapters('sms').some(a => a.provider === 'console'), false);
  assert.throws(() => integrations.validateIntegration('sms', 'console'));
  process.env.NODE_ENV = 'test';
  const logs = [];
  const saved = console.log; console.log = (...items) => logs.push(items);
  try {
    await integrations.getAdapter('sms', 'console').send({ to: users.client.phone, message: 'SECRET_LOCAL_OTP_123456', credentials: { key: 'LOCAL_SECRET' } });
    await integrations.getAdapter('email', 'console').send({ to: users.client.email, subject: 'code', text: 'SECRET_LOCAL_OTP_123456' });
  } finally { console.log = saved; }
  assert.deepEqual(logs, []);
  process.env.NAFATH_ALLOWED_HOSTS = '';
});

test('socket typing/location/chat enforce membership; removed participants and idle revoked sessions receive no private events', async () => {
  if (HAS_BASELINE) {
    const handlers = {}, insecureEvents = [];
    baseline('socket/chatHandler.js')({}, { user: users.outsider, on: (event, fn) => { handlers[event] = fn; }, to: room => ({ emit: (event, payload) => insecureEvents.push({ room, event, payload }) }) });
    handlers['chat:typing']({ conversationId: conversation, isTyping: true });
    assert.equal(insecureEvents[0].room, `conv:${conversation}`);
  }
  const recipient = await socketFor(users.provider), attacker = await socketFor(users.outsider), client = await socketFor(users.client);
  assert.equal((await acknowledge(recipient, 'chat:join', conversation)).ok, true);
  await noEvent(recipient, 'chat:typing', async () => { attacker.emit('chat:typing', { conversationId: conversation, isTyping: true }); });
  assert.equal((await acknowledge(attacker, 'chat:send', { conversationId: conversation, content: 'unauthorized' })).error, 'forbidden');
  assert.equal((await acknowledge(client, 'location:share', { conversationId: conversation, latitude: 999, longitude: 1 })).error, 'invalid_location');
  const point = new Promise(resolve => recipient.once('location:update', resolve));
  assert.equal((await acknowledge(client, 'location:share', { conversationId: conversation, latitude: 26.326, longitude: 43.975, accuracy_m: 0 })).ok, true);
  assert.equal((await point).accuracy_m, 0);
  const delivered = new Promise(resolve => recipient.once('chat:message', resolve));
  assert.equal((await acknowledge(client, 'chat:send', { conversationId: conversation, content: 'authorized' })).ok, true);
  assert.equal((await delivered).content, 'authorized');
  await db.query('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversation, users.provider.id]);
  await noEvent(recipient, 'location:update', () => emitConversation(io, conversation, 'location:update', { latitude: 26.326, longitude: 43.975 }));
  await db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [conversation, users.provider.id]);
  await db.query('UPDATE users SET auth_version = auth_version + 1 WHERE id = ?', [users.provider.id]);
  await noEvent(recipient, 'chat:message', () => emitConversation(io, conversation, 'chat:message', { content: 'revoked-session-secret' }));
  assert.equal(recipient.connected, false);
});

test('archive reads purge expired private GPS/chat payload and cannot restore it', async () => {
  const archive = require('../models/ConversationArchive');
  const saved = await archive.archiveConversation(conversation, { retention_days: 1 });
  await db.query("UPDATE conversation_archives SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = ?", [saved.id]);
  await archive.restore(saved.id);
  const expired = await archive.findById(saved.id);
  assert.equal(expired.status, 'expired'); assert.equal(expired.payload, null);
});

test('durable per-user socket budgets bound concurrent writes across two sockets and conversations while recovery stays usable', async () => {
  const inserted = await db.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'client')", ['Socket burst user', 'burst@test.invalid', 'unused-local-test-hash']);
  const user = { id: inserted.insertId, role: 'client', token: jwt.sign({ id: inserted.insertId, role: 'client', auth_version: 0 }) };
  const conv = await Conversation.findOrCreateBetween(user.id, users.outsider.id);
  const alternative = await Conversation.findOrCreateBetween(user.id, users.other.id);
  const first = await socketFor(user), second = await socketFor(user);
  const chatStore = new AuthRateLimitStore('socket-chat-user'); chatStore.init({ windowMs: 60000 });
  const locationStore = new AuthRateLimitStore('socket-location-user'); locationStore.init({ windowMs: 60000 });
  const count = async table => Number((await db.queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE conversation_id = ? AND ${table === 'messages' ? 'sender_id' : 'user_id'} = ?`, [conv, user.id])).n);
  const concurrent = await Promise.all(Array.from({ length: 4 }, (_, i) => acknowledge(i % 2 ? first : second, 'chat:send', { conversationId: conv, content: `concurrent ${i}` })));
  assert.ok(concurrent.every(r => r.ok), 'Concurrent same-room writes finish without shared-lock upgrade deadlocks');
  assert.equal(await count('messages'), 4);
  // Simulate prior writes in this still-live window, then race ten real writes
  // from two sockets for the five remaining allowances.
  await db.query('UPDATE auth_rate_limits SET total_hits = ? WHERE key = ?', [SOCKET_WRITE_LIMITS.chat - 5, chatStore.hash(String(user.id))]);
  const beforeMessages = await count('messages');
  const chat = await Promise.all(Array.from({ length: 10 }, (_, i) => acknowledge(i % 2 ? first : second, 'chat:send', { conversationId: conv, content: `burst ${i}` })));
  assert.equal(chat.filter(r => r.ok).length, 5);
  assert.equal(chat.filter(r => r.error === 'rate_limited').length, 5);
  assert.equal(await count('messages') - beforeMessages, 5);
  assert.ok(chat.filter(r => !r.ok).every(r => r.retry_after > 0 && r.retry_after <= 60));
  assert.equal(Number((await db.queryOne('SELECT total_hits FROM auth_rate_limits WHERE key = ?', [chatStore.hash(String(user.id))])).total_hits), SOCKET_WRITE_LIMITS.chat + 5);
  assert.equal((await acknowledge(second, 'chat:send', { conversationId: alternative, content: 'alternate conversation bypass' })).error, 'rate_limited');
  assert.equal((await consumeSocketWrite(users.outsider.id, 'chat')).ok, true, 'Another account has its own allowance');

  const beforeLocations = await count('location_shares');
  await locationStore.increment(String(user.id));
  await db.query('UPDATE auth_rate_limits SET total_hits = ? WHERE key = ?', [SOCKET_WRITE_LIMITS.location - 5, locationStore.hash(String(user.id))]);
  const locations = await Promise.all(Array.from({ length: 10 }, (_, i) => acknowledge(i % 2 ? first : second, 'location:share', { conversationId: conv, latitude: 26.326, longitude: 43.975 })));
  assert.equal(locations.filter(r => r.ok).length, 5);
  assert.equal(locations.filter(r => r.error === 'rate_limited').length, 5);
  assert.equal(await count('location_shares') - beforeLocations, 5);
  assert.equal(Number((await db.queryOne('SELECT total_hits FROM auth_rate_limits WHERE key = ?', [locationStore.hash(String(user.id))])).total_hits), SOCKET_WRITE_LIMITS.location + 5);
  assert.equal((await acknowledge(first, 'chat:join', conv)).ok, true);
  assert.equal((await acknowledge(first, 'chat:read', { conversationId: conv })).ok, true);
  assert.equal((await acknowledge(second, 'location:stop', { conversationId: conv })).ok, true);
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM location_shares WHERE conversation_id = ? AND user_id = ? AND is_live = 1', [conv, user.id])).n), 0);

  await db.query("UPDATE auth_rate_limits SET reset_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE key IN (?, ?)", [chatStore.hash(String(user.id)), locationStore.hash(String(user.id))]);
  assert.equal((await acknowledge(first, 'chat:send', { conversationId: conv, content: 'after expiry' })).ok, true);
  assert.equal((await acknowledge(second, 'location:share', { conversationId: conv, latitude: 26.326, longitude: 43.975 })).ok, true);
});
