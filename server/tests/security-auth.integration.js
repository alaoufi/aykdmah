// This suite only creates, uses, and drops its own random localhost database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

if (process.env.AYK_SECURITY_AUTH_TEST !== '1') {
  test('security/auth integration (set AYK_SECURITY_AUTH_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_securityauth_${crypto.randomBytes(10).toString('hex')}`;
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
  const install = require('../services/installService');
  const jwt = require('../utils/jwt');
  const { hashPassword, comparePassword } = require('../utils/hash');
  const socketAuth = require('../socket/auth');
  const { optionalAuth, authenticate } = require('../middleware/auth');
  const { AuthRateLimitStore, authLimiter } = require('../middleware/rateLimiter');
  const { hasPermission } = require('../middleware/roleCheck');
  let server, base, createdDatabase = false, fixtures, hash;
  const password = 'Local-Security-Password-2026';
  const maintenanceClient = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 15000 });
  const identity = () => `security_${crypto.randomBytes(6).toString('hex')}`;
  const tokenFor = user => jwt.sign({ id: Number(user.id), role: user.role, auth_version: Number(user.auth_version || 0) });
  async function createUser(role = 'client', data = {}) {
    const id = await User.create({ full_name: 'Local Security Test', username: identity(), password_hash: hash, role, ...data });
    return User.findByIdRaw(id);
  }
  async function api(path, { token, body, method = 'GET', expected = 200, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return { data: result.data, result, response };
  }
  async function runAuth(middleware, token, options = {}) {
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, method: 'GET', originalUrl: '/api/test', t: key => key, ...options };
    let nextCalled = false, status;
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    await middleware(req, res, err => { if (err) throw err; nextCalled = true; });
    return { req, nextCalled, status };
  }
  test.before(async () => {
    const admin = maintenanceClient();
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; }
    finally { await admin.end(); }
    let setup;
    try { setup = await install.setupFromEnv(); }
    catch (err) {
      const diagnostics = await install.runMigrationsFromEnv();
      const failures = diagnostics.applied.filter(item => item.errors.length).map(item => ({ file: item.file, errors: item.errors }));
      throw new Error(`Local disposable migration failure: ${JSON.stringify(failures)}`);
    }
    assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
    hash = await hashPassword(password);
    const superA = await createUser('admin'), superB = await createUser('admin');
    await db.query('UPDATE users SET is_super_admin = 1 WHERE id IN (?, ?)', [superA.id, superB.id]);
    const restricted = await createUser('admin'), manager = await createUser('admin'), high = await createUser('admin');
    await db.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(['users.manage']), restricted.id]);
    await db.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(['users.manage', 'admins.manage']), manager.id]);
    await db.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(['users.manage', 'integrations.manage']), high.id]);
    fixtures = { superA, superB, restricted, manager, high, client: await createUser(), provider: await createUser('provider') };
    server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const admin = maintenanceClient();
      await admin.connect();
      try { await admin.query(`DROP DATABASE "${databaseName}"`); }
      finally { await admin.end(); }
    }
  });

  test('new hashes cover all UTF-8 bytes and existing bcrypt credentials remain valid', async () => {
    for (const prefix of ['a'.repeat(72), 'é'.repeat(36)]) {
      const saved = await hashPassword(prefix + 'first');
      assert.equal(await comparePassword(prefix + 'first', saved), true);
      assert.equal(await comparePassword(prefix + 'other', saved), false);
    }
    const legacy = await require('bcryptjs').hash(password, 4);
    assert.equal(await comparePassword(password, legacy), true);
    assert.equal(await comparePassword(password + 'wrong', legacy), false);
    await assert.rejects(hashPassword(123456));
  });

  test('registration validates password types and ignores privileged mass-assignment', async () => {
    for (const invalid of [123456, ['abcdef']]) {
      await api('/auth/register', { method: 'POST', expected: 422, body: { full_name: 'Local Invalid', username: identity(), password: invalid, role: 'client' } });
    }
    const session = await api('/auth/register', { method: 'POST', expected: 201, body: { full_name: 'Local Registration', username: identity(), password, role: 'client', is_super_admin: 1, permissions: ['admins.manage'], is_verified: 1, auth_version: 99 } });
    const row = await User.findByIdRaw(session.data.user.id);
    assert.equal(row.is_super_admin, 0);
    assert.equal(row.is_verified, 0);
    assert.equal(row.auth_version, 0);
    assert.equal(hasPermission(session.data.user, 'admins.manage'), false);
    assert.match(session.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(session.response.headers.get('set-cookie'), /SameSite=Lax/);
    assert.equal((await api('/auth/me', { token: session.data.token })).data.user.password_hash, undefined);
  });

  test('concurrent normalized phone and email registration creates exactly one owner', async () => {
    const phone = `05${String(crypto.randomInt(100000000)).padStart(8, '0')}`;
    const email = `${identity()}@example.invalid`;
    for (const shared of [{ phone }, { email }]) {
      const attempts = await Promise.all([0, 1].map(async index => {
        const response = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: 'Local Identifier Race', username: identity(), password, role: 'client', ...shared, ...(shared.phone ? { phone: index ? shared.phone : `${shared.phone.slice(0, 3)} ${shared.phone.slice(3)}` } : { email: index ? shared.email : shared.email.toUpperCase() }) }) });
        await response.json(); return response.status;
      }));
      assert.deepEqual(attempts.sort((a, b) => a - b), [201, 409]);
      const rows = await db.query(shared.phone ? "SELECT id FROM users WHERE REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g') = ?" : 'SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [shared.phone || shared.email]);
      assert.equal(rows.length, 1);
    }
    await api('/auth/register', { method: 'POST', expected: 409, body: { full_name: 'Local Cross-Field Collision', username: phone, password, role: 'client' } });
  });

  test('ambiguous legacy identifiers fail closed and unique formatted identifiers remain usable', async () => {
    const phone = `06${String(crypto.randomInt(100000000)).padStart(8, '0')}`;
    const user = await createUser('client', { phone: `${phone.slice(0, 3)} ${phone.slice(3)}` });
    assert.equal((await User.findByIdentifier(phone)).id, user.id);
    await db.query("INSERT INTO users (full_name, username, phone, password_hash, role) VALUES (?, ?, ?, ?, 'client')", ['Legacy Duplicate', identity(), phone, hash]);
    assert.equal(await User.findByIdentifier(phone), null);
    const numeric = String(crypto.randomInt(10000000, 99999999));
    const numericUser = await createUser('client', { username: numeric });
    assert.equal((await User.findByIdentifier(numeric)).id, numericUser.id);
    const email = `${identity()}@example.invalid`;
    const emailUser = await createUser('client', { email });
    assert.equal((await User.findByIdentifier(email.toUpperCase())).id, emailUser.id);
  });

  test('public profiles exclude private contact, identifiers, GPS, privileges and financial fields', async () => {
    await db.query('UPDATE users SET email = ?, phone = ?, facebook_id = ?, latitude = 26.35, longitude = 43.97 WHERE id = ?', ['local@example.invalid', '0501111111', '999888777', fixtures.client.id]);
    const data = (await api(`/users/${fixtures.client.id}`)).data;
    for (const field of ['email', 'phone', 'facebook_id', 'username', 'latitude', 'longitude', 'is_super_admin', 'permissions', 'is_active', 'is_blocked']) assert.equal(data.user[field], undefined, field);
    await api(`/users/${fixtures.superA.id}`, { expected: 404 });
    const own = (await api(`/users/${fixtures.client.id}`, { token: tokenFor(fixtures.client) })).data;
    assert.equal(own.user.phone, '0501111111');
    const provider = (await api(`/users/${fixtures.provider.id}`)).data.provider;
    for (const field of ['email', 'phone', 'total_earnings', 'current_subscription_id', 'fixed_latitude', 'fixed_longitude', 'badge_trusted_active']) assert.equal(provider[field], undefined, field);
  });

  test('user managers cannot take over, promote, block, delete or modify admin accounts', async () => {
    const token = tokenFor(fixtures.restricted);
    for (const body of [{ password: 'New-Attacker-Password' }, { email: 'takeover@example.invalid' }, { role: 'client' }, { is_active: false }]) await api(`/users/${fixtures.superA.id}`, { token, method: 'PUT', body, expected: 403 });
    for (const path of ['block', 'unblock']) await api(`/users/${fixtures.superA.id}/${path}`, { token, method: 'POST', expected: 403 });
    await api(`/users/${fixtures.superA.id}`, { token, method: 'DELETE', expected: 403 });
    await api(`/users/${fixtures.client.id}`, { token, method: 'PUT', body: { role: 'admin' }, expected: 403 });
    await api(`/users/${fixtures.provider.id}`, { token, method: 'PUT', body: { is_verified: true }, expected: 403 });
    await api('/users', { token, method: 'POST', body: { full_name: 'Forbidden Admin', username: identity(), password, role: 'admin' }, expected: 403 });
    const saved = await User.findByIdRaw(fixtures.superA.id);
    assert.equal(await comparePassword(password, saved.password_hash), true);
    assert.equal(saved.role, 'admin');
    assert.equal(saved.is_active, 1);
  });

  test('admin delegation cannot expand its own privileges or take over a higher privilege peer', async () => {
    const token = tokenFor(fixtures.manager);
    await api(`/admin/users/${fixtures.manager.id}/permissions`, { token, method: 'PUT', body: { permissions: ['users.manage', 'admins.manage', 'integrations.manage'] }, expected: 403 });
    await api(`/users/${fixtures.high.id}`, { token, method: 'PUT', body: { password: 'Higher-Privilege-Takeover' }, expected: 403 });
    await api(`/admin/users/${fixtures.high.id}/permissions`, { token, method: 'PUT', body: { permissions: ['users.manage'] }, expected: 403 });
    await api(`/admin/users/${fixtures.restricted.id}/permissions`, { token, method: 'PUT', body: { permissions: ['users.manage'] } });
    await api('/auth/me', { token: tokenFor(fixtures.restricted), expected: 401 });
  });

  test('provider editing enforces both ownership and administrator grants', async () => {
    await api('/users/me/provider', { token: tokenFor(fixtures.high), method: 'PUT', body: { user_id: fixtures.provider.id, business_name: 'Denied' }, expected: 200 });
    const noGrant = await createUser('admin');
    await api('/users/me/provider', { token: tokenFor(noGrant), method: 'PUT', body: { user_id: fixtures.provider.id, business_name: 'Denied' }, expected: 403 });
    const other = await createUser('provider');
    await api('/users/me/provider', { token: tokenFor(other), method: 'PUT', body: { user_id: fixtures.provider.id, business_name: 'Own Profile Only' } });
    assert.equal((await User.getProviderProfile(fixtures.provider.id)).business_name, 'Denied');
    assert.equal((await User.getProviderProfile(other.id)).business_name, 'Own Profile Only');
    await api('/users/me/provider', { token: tokenFor(other), method: 'PUT', body: { service_ids: 'not-an-array' }, expected: 400 });
  });

  test('profile contact changes invalidate old verification and outstanding codes atomically', async () => {
    const user = await createUser('client', { phone: '0507777777' });
    await db.query("INSERT INTO user_verifications (user_id, method, status, identifier, verified_at) VALUES (?, 'sms', 'verified', ?, CURRENT_TIMESTAMP)", [user.id, user.phone]);
    await db.query("INSERT INTO verification_otps (user_id, method, identifier, code_hash, expires_at) VALUES (?, 'sms', ?, ?, CURRENT_TIMESTAMP + INTERVAL '10 minutes')", [user.id, user.phone, crypto.createHash('sha256').update('synthetic-code').digest('hex')]);
    await db.query('UPDATE users SET is_verified = 1, phone_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    await api('/users/me', { token: tokenFor(user), method: 'PUT', body: { phone: '0508888888' } });
    assert.equal(await db.queryOne("SELECT id FROM user_verifications WHERE user_id = ? AND method = 'sms'", [user.id]), null);
    assert.ok((await db.queryOne('SELECT consumed_at FROM verification_otps WHERE user_id = ?', [user.id])).consumed_at);
    const saved = await User.findByIdRaw(user.id);
    assert.equal(saved.is_verified, 0);
    assert.equal(saved.phone_verified_at, null);
    const phoneOnly = await createUser('client', { username: null, phone: '0509999999' });
    await api('/users/me', { token: tokenFor(phoneOnly), method: 'PUT', body: { phone: null, username: 'ignored_mass_assignment' }, expected: 400 });
    assert.equal((await User.findByIdRaw(phoneOnly.id)).phone, '0509999999');
  });

  test('dashboard grants do not disclose private user/request/conversation data', async () => {
    const user = await createUser('admin');
    await db.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(['dashboard.view']), user.id]);
    const dashboard = (await api('/admin/dashboard', { token: tokenFor(user) })).data;
    assert.deepEqual(dashboard.recent_users, []);
    assert.deepEqual(dashboard.recent_requests, []);
    for (const field of ['messages', 'live_locations', 'total_locations', 'conversations', 'disputes']) assert.equal(dashboard.stats[field], undefined);
  });

  test('verification review is serialized and cannot replay or reverse a completed decision', async () => {
    const user = await createUser('provider');
    const document = await db.query("INSERT INTO verification_requests (user_id, document_type, document_url) VALUES (?, 'license', ?)", [user.id, `/api/media/${crypto.randomUUID()}`]);
    const token = tokenFor(fixtures.superA);
    await api(`/admin/verifications/${document.insertId}/review`, { token, method: 'POST', body: { action: 'invalid' }, expected: 400 });
    await api(`/admin/verifications/${document.insertId}/review`, { token, method: 'POST', body: { action: 'approve' } });
    await api(`/admin/verifications/${document.insertId}/review`, { token, method: 'POST', body: { action: 'reject' }, expected: 409 });
    assert.equal((await User.findByIdRaw(user.id)).is_verified, 1);
    const rejected = await db.query("INSERT INTO verification_requests (user_id, document_type, document_url) VALUES (?, 'other', ?)", [user.id, `/api/media/${crypto.randomUUID()}`]);
    await api(`/admin/verifications/${rejected.insertId}/review`, { token, method: 'POST', body: { action: 'reject' } });
    assert.equal((await User.findByIdRaw(user.id)).is_verified, 1, 'An independent approved document must remain valid');
  });

  test('generic ad editing cannot activate or extend an unpaid user campaign', async () => {
    const ad = await db.query("INSERT INTO ads (title, user_id, status, is_active) VALUES (?, ?, 'awaiting_payment', 0)", ['Local Unpaid Campaign', fixtures.client.id]);
    const token = tokenFor(fixtures.superA);
    await api(`/admin/ads/${ad.insertId}`, { token, method: 'PUT', body: { status: 'active', is_active: true }, expected: 403 });
    await api(`/admin/ads/${ad.insertId}`, { token, method: 'PUT', body: { ends_at: '2030-01-01T00:00:00Z' }, expected: 403 });
    await api(`/admin/ads/${ad.insertId}`, { token, method: 'PUT', body: { title: 'Edited Content' } });
    assert.equal((await db.queryOne('SELECT status FROM ads WHERE id = ?', [ad.insertId])).status, 'awaiting_payment');
    await api('/admin/ads', { token, method: 'POST', body: { title: 'Unsafe Link', link: 'javascript:alert(1)' }, expected: 400 });
  });

  test('admin pagination and entity IDs reject malformed and oversized inputs before querying', async () => {
    const token = tokenFor(fixtures.superA);
    for (const path of ['/admin/verifications?limit=1000000000', '/admin/activity-logs?page=Infinity', '/admin/conversations?search[bad]=value', '/admin/users/not-an-id/permissions']) await api(path, { token, expected: 400 });
  });

  test('login finalization cannot issue a current-version session using a replaced password hash', async () => {
    const user = await createUser(), oldHash = user.password_hash;
    const replacement = await hashPassword('Atomic-Replacement-Password');
    assert.equal(await User.updatePassword(user.id, replacement, oldHash), true);
    assert.equal(await User.completeLogin(user.id, oldHash), null);
    assert.equal(await User.updatePassword(user.id, hash, oldHash), false);
    assert.equal((await User.completeLogin(user.id, replacement)).auth_version, 1);
  });

  test('logout revokes bearer, optional authentication and socket sessions', async () => {
    const user = await createUser(), token = tokenFor(user);
    assert.equal((await socketAuth.validateToken(token)).id, user.id);
    await api('/auth/logout', { token, method: 'POST' });
    await api('/auth/me', { token, expected: 401 });
    assert.equal((await runAuth(optionalAuth, token)).req.user, undefined);
    await assert.rejects(socketAuth.validateToken(token));
    const current = await User.findByIdRaw(user.id);
    assert.equal(current.auth_version, 1);
  });

  test('password replacement revokes existing sessions and preserves full long passwords', async () => {
    const user = await createUser(), token = tokenFor(user), nextPassword = 'a'.repeat(72) + 'first';
    await api('/auth/password', { token, method: 'PUT', body: { current_password: password, new_password: nextPassword } });
    await api('/auth/me', { token, expected: 401 });
    await assert.rejects(socketAuth.validateToken(token));
    const row = await User.findByIdRaw(user.id);
    assert.equal(await comparePassword(nextPassword, row.password_hash), true);
    assert.equal(await comparePassword('a'.repeat(72) + 'other', row.password_hash), false);
    const login = (await api('/auth/login', { method: 'POST', body: { identifier: user.username, password: nextPassword } })).data;
    await api('/auth/me', { token: login.token });
  });

  test('inactive, blocked and deleted accounts cannot authenticate through optional or socket paths', async () => {
    for (const field of ['is_active', 'is_blocked', 'deleted_at']) {
      const user = await createUser(), token = tokenFor(user);
      await db.query(`UPDATE users SET ${field} = ? WHERE id = ?`, [field === 'is_active' ? 0 : field === 'is_blocked' ? 1 : new Date(), user.id]);
      assert.equal((await runAuth(optionalAuth, token)).req.user, undefined);
      await assert.rejects(socketAuth.validateToken(token));
      const result = await runAuth(authenticate, token);
      assert.equal(result.nextCalled, false);
      assert.ok([401, 403].includes(result.status));
    }
  });

  test('legacy tokens are allowed only at version zero and authorization uses current DB role', async () => {
    const user = await createUser(), legacy = jwt.sign({ id: Number(user.id), role: 'admin' });
    assert.equal((await runAuth(optionalAuth, legacy)).req.userRole, 'client');
    await User.revokeSessions(user.id);
    assert.equal((await runAuth(optionalAuth, legacy)).req.user, undefined);
    const rawJwt = require('jsonwebtoken');
    assert.throws(() => jwt.verify(rawJwt.sign({ id: Number(user.id), role: 'client' }, process.env.JWT_SECRET, { algorithm: 'HS512' })));
    assert.throws(() => jwt.verify(jwt.sign({ id: -1, role: 'client' })));
    const expired = jwt.sign({ id: Number(user.id), role: 'client', auth_version: 1 }, { expiresIn: -1 });
    assert.equal((await runAuth(optionalAuth, expired)).req.user, undefined);
    await assert.rejects(socketAuth.validateToken(expired));
  });

  test('HttpOnly token cookies authenticate only media reads and cannot authorize API mutations', async () => {
    const user = await createUser(), token = tokenFor(user);
    const media = await runAuth(authenticate, token, { headers: {}, cookies: { token }, originalUrl: '/api/media/00000000-0000-4000-8000-000000000000' });
    assert.equal(media.nextCalled, true);
    await api('/auth/me', { headers: { Cookie: `token=${token}` }, expected: 401 });
    await api('/users/me', { method: 'PUT', body: { full_name: 'Cookie Attack' }, headers: { Cookie: `token=${token}`, Origin: 'https://untrusted.example' }, expected: 401 });
  });

  test('credential encryption authenticates canonical envelopes and rejects weak/malformed keys', () => {
    const encryption = require('../utils/encryption');
    const blob = encryption.encryptJson({ token: 'synthetic-local-only' });
    assert.deepEqual(encryption.decryptJson(blob), { token: 'synthetic-local-only' });
    const parts = blob.split(':');
    parts[2] = Buffer.from(parts[2], 'base64').subarray(0, 4).toString('base64');
    assert.throws(() => encryption.decrypt(parts.join(':')));
    const malformed = blob.split(':'); malformed[1] += ' ';
    assert.throws(() => encryption.decrypt(malformed.join(':')));
    assert.throws(() => encryption.decrypt('v2:unsupported'));
    const source = fs.readFileSync(require.resolve('../utils/encryption'), 'utf8');
    for (const env of [{}, { ENCRYPTION_KEY: 'x'.repeat(32) }]) {
      const sandbox = { require, Buffer, process: { env }, module: { exports: {} } };
      vm.runInNewContext(source, sandbox);
      assert.throws(() => sandbox.module.exports.encrypt('synthetic-local-only'));
    }
  });

  test('auth throttling is durable and atomic across independent server instances', async () => {
    const namespace = identity(), first = new AuthRateLimitStore(namespace), second = new AuthRateLimitStore(namespace);
    first.init({ windowMs: 900000 }); second.init({ windowMs: 900000 });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => (index % 2 ? first : second).increment('synthetic-key')));
    assert.deepEqual(results.map(row => row.totalHits).sort((a, b) => a - b), Array.from({ length: 40 }, (_, index) => index + 1));
    await authLimiter.resetKey('127.0.0.1');
    for (let index = 0; index < 21; index++) await api('/auth/login', { method: 'POST', expected: index < 20 ? 401 : 429, body: { identifier: 'missing_local_account', password } });
  });

  test('concurrent super-admin demotions preserve one active super administrator', async () => {
    const users = await db.query("SELECT id FROM users WHERE role='admin' AND is_super_admin=1 AND is_active=1 AND is_blocked=0 AND deleted_at IS NULL");
    assert.equal(users.length, 2);
    const attempts = await Promise.all([fixtures.superA, fixtures.superB].map(async user => {
      const response = await fetch(`${base}/admin/users/${user.id}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(user)}` }, body: JSON.stringify({ is_super_admin: false, permissions: [] }) });
      await response.json(); return response.status;
    }));
    assert.deepEqual(attempts.sort((a, b) => a - b), [200, 400]);
    const row = await db.queryOne("SELECT COUNT(*) AS total FROM users WHERE role='admin' AND is_super_admin=1 AND is_active=1 AND is_blocked=0 AND deleted_at IS NULL");
    assert.equal(Number(row.total), 1);
  });
}
