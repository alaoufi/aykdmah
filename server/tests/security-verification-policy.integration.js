// Only a newly created disposable localhost database is used by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (process.env.AYK_SECURITY_VERIFICATION_POLICY_TEST !== '1') {
  test('verification policy integration (set AYK_SECURITY_VERIFICATION_POLICY_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_verificationpolicy_${crypto.randomBytes(10).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '55432');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid localhost test port');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '10000',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', ENCRYPTION_KEY: '',
    MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '',
    WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
    PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
    PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', GOOGLE_MAPS_API_KEY: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), JWT_EXPIRES_IN: '1h',
    APP_URL: 'http://127.0.0.1', CLIENT_URL: 'http://127.0.0.1',
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const User = require('../models/User');
  const Request = require('../models/Request');
  const Offer = require('../models/Offer');
  const Message = require('../models/Message');
  const Conversation = require('../models/Conversation');
  const UserVerification = require('../models/UserVerification');
  const install = require('../services/installService');
  const jwt = require('../utils/jwt');
  const { hashPassword } = require('../utils/hash');
  const policy = require('../middleware/verificationPolicy');
  const registerChatHandlers = require('../socket/chatHandler');
  let server, base, createdDatabase = false, client, provider, admin, hash;
  const maintenance = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  const identity = () => `localpolicy_${crypto.randomBytes(8).toString('hex')}`;
  const job = user => ({ client_id: user.id, title: 'Local policy request', description: 'Disposable local policy security fixture' });
  const denied = promise => assert.rejects(promise, err => err.status === 403 && err.message === 'verification_required');
  async function account(role) {
    const id = await User.create({ full_name: 'Local Verification Fixture', username: identity(), email: `${identity()}@example.invalid`,
      phone: `05${String(crypto.randomInt(100000000)).padStart(8, '0')}`, password_hash: hash, role });
    const user = await User.findByIdRaw(id);
    return { ...user, token: jwt.sign({ id, role, auth_version: 0 }) };
  }
  async function setPolicy({ block = true, providerMethods = 'sms', clientMethods = '', guests = true } = {}) {
    const values = { verify_block_until_verified: String(block), verify_required_for_provider: providerMethods,
      verify_required_for_client: clientMethods, verify_allow_guest_browsing: String(guests) };
    for (const [key, value] of Object.entries(values)) await db.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
  }
  async function verify(user, method, options = {}) {
    const identifier = options.identifier ?? (method === 'email' ? user.email : user.phone);
    return UserVerification.upsert({ user_id: user.id, method, status: options.status || 'verified', identifier,
      expires_at: options.expires_at || null, metadata: options.metadata || { confirmed_via: 'otp' } });
  }
  async function api(path, { user, body, method = 'GET', expected = 200 } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Accept-Language': 'en', ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${result.message}`);
    return result;
  }
  const count = async table => Number((await db.query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total);
  test.before(async () => {
    const conn = maintenance(); await conn.connect();
    try { await conn.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await conn.end(); }
    const setup = await install.setupFromEnv();
    assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
    hash = await hashPassword('Disposable-Local-Verification-2026');
    client = await account('client'); provider = await account('provider'); admin = await account('admin');
    server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const conn = maintenance(); await conn.connect();
      try { await conn.query(`DROP DATABASE "${databaseName}"`); } finally { await conn.end(); }
    }
  });
  test.beforeEach(async () => {
    await setPolicy();
    await db.query('DELETE FROM user_verifications WHERE user_id IN (?, ?)', [client.id, provider.id]);
    await db.query('UPDATE users SET is_verified = 0 WHERE id IN (?, ?)', [client.id, provider.id]);
  });

  test('disabled blocking, empty role requirements and administrator exemption preserve normal access', async () => {
    await setPolicy({ block: false, providerMethods: 'sms,email', clientMethods: 'nafath' });
    await policy.assertMarketplaceWriteAccess(client.id); await policy.assertMarketplaceWriteAccess(provider.id);
    await setPolicy({ providerMethods: 'sms', clientMethods: '' });
    await policy.assertMarketplaceWriteAccess(client.id); await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await policy.assertMarketplaceWriteAccess(admin.id);
    await setPolicy({ providerMethods: '', clientMethods: '' });
    await policy.assertMarketplaceWriteAccess(provider.id);
  });

  test('all configured methods require verified records bound to current contact, regardless of broad verified flag', async () => {
    await setPolicy({ providerMethods: 'sms,email' });
    await db.query('UPDATE users SET is_verified = 1 WHERE id = ?', [provider.id]);
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await denied(policy.assertMarketplaceWriteAccess({ id: provider.id, role: 'admin', is_verified: 1 }));
    await verify(provider, 'sms'); await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'email', { identifier: 'different@example.invalid' }); await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'email', { identifier: ` ${provider.email.toUpperCase()} ` });
    await verify(provider, 'sms', { identifier: `${provider.phone.slice(0, 3)} ${provider.phone.slice(3)}` });
    await policy.assertMarketplaceWriteAccess(provider.id);
    await verify(provider, 'sms', { identifier: '0500000000' }); await denied(policy.assertMarketplaceWriteAccess(provider.id));
  });

  test('pending, expired and unapproved contact records cannot satisfy requirements', async () => {
    await setPolicy({ providerMethods: 'whatsapp,email' });
    await verify(provider, 'whatsapp'); await verify(provider, 'email', { status: 'pending' });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'email', { expires_at: new Date(Date.now() - 1000).toISOString() });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'email'); await db.query("UPDATE user_verifications SET verified_at = NULL WHERE user_id = ? AND method = 'email'", [provider.id]);
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'email'); await policy.assertMarketplaceWriteAccess(provider.id);
  });

  test('request HTTP and direct model writes enforce client requirements while account recovery remains available', async () => {
    await setPolicy({ clientMethods: 'email' });
    const before = await count('requests');
    await denied(Request.create(job(client)));
    const result = await api('/requests', { user: client, method: 'POST', body: job(client), expected: 403 });
    assert.match(result.message, /verification/i);
    assert.notEqual(result.message, 'verification_required');
    assert.equal(await count('requests'), before);
    await api('/auth/me', { user: client }); await api('/verify/status', { user: client }); await api('/requests/my', { user: client });
    await verify(client, 'email');
    await api('/requests', { user: client, method: 'POST', body: job(client), expected: 201 });
  });

  test('offer model and HTTP reject unverified providers and old bids cannot bypass provider verification at acceptance', async () => {
    const id = await Request.create(job(client));
    const before = await count('offers');
    await denied(Offer.create({ request_id: id, provider_id: provider.id, price: 25 }));
    await api('/offers', { user: provider, method: 'POST', body: { request_id: id, price: 25 }, expected: 403 });
    assert.equal(await count('offers'), before);
    await setPolicy({ block: false });
    const bid = await Offer.create({ request_id: id, provider_id: provider.id, price: 25 });
    await setPolicy();
    await denied(Offer.acceptOffer(bid, client.id));
    await api(`/offers/${bid}/accept`, { user: client, method: 'PUT', body: {}, expected: 403 });
    assert.equal((await Request.findById(id)).status, 'open');
    assert.equal((await Offer.findById(bid)).status, 'pending');
    await verify(provider, 'sms');
    await setPolicy({ clientMethods: 'email' });
    await denied(Offer.acceptOffer(bid, client.id));
    await verify(client, 'email');
    await api(`/offers/${bid}/accept`, { user: client, method: 'PUT', body: {}, expected: 200 });
    assert.equal((await Request.findById(id)).assigned_provider_id, provider.id);
  });

  test('chat HTTP and direct message writes are blocked but established reads, deletion and stop remain accessible', async () => {
    await setPolicy({ block: false });
    const conversation = await Conversation.findOrCreateBetween(client.id, provider.id);
    const message = await Message.create({ conversation_id: conversation, sender_id: client.id, content: 'Existing local recovery message' });
    const id = await Request.create(job(client));
    await setPolicy({ clientMethods: 'email' });
    const before = await count('messages');
    await denied(Message.create({ conversation_id: conversation, sender_id: client.id, content: 'Policy blocked' }));
    await api(`/chat/conversations/${conversation}/messages`, { user: client, method: 'POST', body: { content: 'Policy blocked' }, expected: 403 });
    await api('/chat/conversations', { user: client, method: 'POST', body: { user_id: provider.id }, expected: 403 });
    await api(`/requests/${id}/chat`, { user: client, method: 'POST', body: {}, expected: 403 });
    await api(`/chat/conversations/${conversation}/location`, { user: client, method: 'POST', body: { latitude: 26.3, longitude: 43.9 }, expected: 403 });
    assert.equal(await count('messages'), before);
    await api(`/chat/conversations/${conversation}/messages`, { user: client });
    await api(`/chat/conversations/${conversation}/read`, { user: client, method: 'PUT', body: {} });
    await api(`/chat/conversations/${conversation}/messages/${message}`, { user: client, method: 'DELETE' });
    await api(`/chat/conversations/${conversation}/location`, { user: client, method: 'DELETE' });
    await api(`/requests/${id}/status`, { user: client, method: 'PUT', body: { status: 'cancelled' } });
    await api(`/requests/${id}`, { user: client, method: 'DELETE' });
    await verify(client, 'email');
    await api(`/chat/conversations/${conversation}/messages`, { user: client, method: 'POST', body: { content: 'Verified local message' }, expected: 201 });
  });

  test('Socket.IO chat and live location handlers cannot bypass policy and preserve recovery acknowledgements', async () => {
    const conversation = await Conversation.findOrCreateBetween(client.id, provider.id);
    await setPolicy({ clientMethods: 'email' });
    const handlers = new Map();
    const socket = { id: 'local-policy-socket', user: client, on: (name, handler) => handlers.set(name, handler), join() {}, leave() {} };
    const io = { in() { return { async fetchSockets() { return []; } }; } };
    registerChatHandlers(io, socket);
    const invoke = async (name, data) => { let result; await handlers.get(name)(data, ack => { result = ack; }); return result; };
    const messages = await count('messages'), points = await count('location_shares');
    assert.equal((await invoke('chat:send', { conversationId: conversation, content: 'Blocked socket write' })).ok, false);
    assert.equal((await invoke('location:share', { conversationId: conversation, latitude: 26.3, longitude: 43.9 })).ok, false);
    assert.equal(await count('messages'), messages); assert.equal(await count('location_shares'), points);
    assert.equal((await invoke('chat:join', conversation)).ok, true);
    assert.equal((await invoke('chat:read', { conversationId: conversation })).ok, true);
    assert.equal((await invoke('location:stop', { conversationId: conversation })).ok, true);
    await verify(client, 'email');
    assert.equal((await invoke('chat:send', { conversationId: conversation, content: 'Verified local socket write' })).ok, true);
    assert.equal((await invoke('location:share', { conversationId: conversation, latitude: 26.3, longitude: 43.9 })).ok, true);
    assert.equal(await count('messages'), messages + 1); assert.equal(await count('location_shares'), points + 1);
  });

  test('disabled guest browsing gates requests, provider profiles and public reviews while essential public endpoints stay available', async () => {
    const id = await Request.create(job(client));
    await setPolicy({ guests: false });
    for (const path of ['/requests/nearby', `/requests/${id}`, `/users/${provider.id}`, `/users/${provider.id}/reviews`,
      `/reviews/user/${provider.id}`, `/reviews/user/${provider.id}/stats`, `/reviews/provider/${provider.id}`, '/reviews/1/translation']) {
      await api(path, { expected: 401 });
    }
    for (const path of ['/requests/nearby', `/requests/${id}`, `/users/${provider.id}`, `/reviews/user/${provider.id}`]) await api(path, { user: client });
    for (const path of ['/verify/policy', '/settings/public', '/categories', '/services', '/countries', '/cities', '/health', '/health/db']) await api(path);
    await api('/auth/me', { user: client }); await api('/verify/status', { user: client });
    await setPolicy({ guests: true }); await api('/requests/nearby');
  });

  test('Nafath requires bound real approval proof and retains valid legacy approvals past pending timeout', async () => {
    await setPolicy({ providerMethods: 'nafath' });
    const proof = { transactionId: identity(), integrationId: 1, provider: 'nafath', confirmed_via: 'nafath' };
    const identifier = '1234567890';
    await verify(provider, 'nafath', { identifier, metadata: { ...proof, provider: 'noop' } });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'nafath', { identifier, metadata: { confirmed_via: 'nafath' } });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'nafath', { identifier: 'invalid-national-id', metadata: proof });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    await verify(provider, 'nafath', { status: 'pending', identifier, expires_at: new Date(Date.now() + 60000).toISOString(), metadata: proof });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    assert.equal(await UserVerification.approveNafath(provider.id, proof.transactionId, proof.integrationId, proof.provider, { confirmed_via: 'nafath' }), true);
    assert.equal((await UserVerification.findCurrent(provider.id, 'nafath')).expires_at, null);
    await policy.assertMarketplaceWriteAccess(provider.id);
    await db.query("UPDATE user_verifications SET expires_at = ? WHERE user_id = ? AND method = 'nafath'", [new Date(Date.now() - 60000).toISOString(), provider.id]);
    await policy.assertMarketplaceWriteAccess(provider.id);
  });

  test('contact replacement immediately invalidates verification-dependent marketplace access', async () => {
    const user = await account('client');
    await setPolicy({ clientMethods: 'sms,email' }); await verify(user, 'sms'); await verify(user, 'email');
    await Request.create(job(user));
    // Email is deliberately not editable through the self-profile model.
    // An ignored mass-assignment field must not invalidate an unchanged email.
    await User.update(user.id, { full_name: 'Local Renamed Account', email: `${identity()}@example.invalid` });
    assert.equal((await User.findByIdRaw(user.id)).email, user.email);
    assert.ok(await UserVerification.findCurrent(user.id, 'email'));
    await policy.assertMarketplaceWriteAccess(user.id);
    await User.update(user.id, { phone: `06${String(crypto.randomInt(100000000)).padStart(8, '0')}` });
    await denied(Request.create(job(user)));
    assert.equal(await UserVerification.findCurrent(user.id, 'sms'), null);
  });

  test('unknown required methods and policy database failures fail closed', async () => {
    await setPolicy({ providerMethods: 'unsupported' });
    await denied(policy.assertMarketplaceWriteAccess(provider.id));
    const databaseError = new Error('Disposable local unavailable policy store');
    await assert.rejects(policy.assertMarketplaceWriteAccess(provider.id, { query: async (sql, args) => {
      if (sql.includes('FROM settings')) throw databaseError;
      return db.query(sql, args);
    } }), err => err === databaseError);
  });
}
