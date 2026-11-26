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
    // AYK-383: an administration account is an ordinary person on the site; its rights never show.
    const both = await createUser('provider');
    await db.query(`UPDATE users SET is_admin = 1, permissions = '["users.manage"]' WHERE id = ?`, [both.id]);
    const adminPublic = (await api(`/users/${both.id}`)).data.user;
    assert.equal(adminPublic.role, 'provider', 'a provider who is also in the administration is a provider on the site');
    for (const field of ['is_admin', 'is_super_admin', 'permissions', 'permission_grants', 'admin_account', 'email', 'phone']) assert.equal(adminPublic[field], undefined, field);
    assert.notEqual(adminPublic.role, 'admin');
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
    assert.equal(Number(saved.is_admin), 1, 'still an administration account (AYK-383: the mark, not the role)');
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
    // AYK-388: where a paid ad shows is the administration's to set; it activates nothing and the amount stays.
    await api(`/admin/ads/${ad.insertId}`, { token, method: 'PUT', body: { target_regions: [1], target_cities: ['الرياض'] } });
    const targeted = await db.queryOne('SELECT status, is_active, target_regions, target_cities FROM ads WHERE id = ?', [ad.insertId]);
    assert.deepEqual([targeted.status, Number(targeted.is_active)], ['awaiting_payment', 0]);
    assert.deepEqual(typeof targeted.target_regions === 'string' ? JSON.parse(targeted.target_regions) : targeted.target_regions, [1]);
    assert.ok((await db.queryOne("SELECT 1 AS ok FROM activity_logs WHERE action = 'admin.ad.targeting' AND entity_id = ?", [ad.insertId]))?.ok, 'logged');
    await api(`/admin/ads/${ad.insertId}`, { token, method: 'PUT', body: { target_regions: [2], is_active: true }, expected: 403 });
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
    assert.equal(current.site_session_version, 1);
  });

  // AYK-151: the same account signed in to the site and to /admin; each signs out on its own.
  // AYK-201: the App Review accounts sign in with a password, have a shared request and a chat,
  // and the provider stays paused so real requesters are never matched with it.
  test('App Review accounts are ready for both roles and safe to run again', async () => {
    const { prepareReviewAccounts, ACCOUNTS } = require('../scripts/review-accounts');
    const first = await prepareReviewAccounts('Review-Local-2026');
    const again = await prepareReviewAccounts('Review-Local-2026b');
    assert.deepEqual([again.client, again.provider, again.request, again.conversation], [first.client, first.provider, first.request, first.conversation]);
    for (const account of ACCOUNTS) {
      const signed = (await api('/auth/login', { method: 'POST', body: { identifier: account.username, password: 'Review-Local-2026b' } })).data;
      assert.equal(signed.user.role, account.role);
      await api('/auth/login', { method: 'POST', body: { identifier: account.username, password: 'Review-Local-2026' }, expected: 401 });
    }
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', [first.conversation])).n), 2);
    assert.equal((await db.queryOne('SELECT availability_status FROM provider_profiles WHERE user_id = ?', [first.provider])).availability_status, 'paused');
    assert.equal((await db.queryOne('SELECT status FROM requests WHERE id = ?', [first.request])).status, 'assigned');
    // Accounts the owner made in the admin area: sample data added, password untouched.
    const seeded = await prepareReviewAccounts(null, { seedOnly: true });
    assert.equal(seeded.conversation, first.conversation);
    await api('/auth/login', { method: 'POST', body: { identifier: ACCOUNTS[0].username, password: 'Review-Local-2026b' } });
    // A phone keyboard capitalizes the first letter (App Review run 5): usernames ignore case.
    const capital = ACCOUNTS[0].username[0].toUpperCase() + ACCOUNTS[0].username.slice(1);
    assert.equal(String((await User.findByIdentifier(capital))?.username), ACCOUNTS[0].username);
  });

  test('site and admin sessions of one account are separate', async () => {
    const user = await createUser();
    await db.query("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
    const body = { identifier: user.username, password };
    const site = (await api('/auth/login', { method: 'POST', body })).data;
    const admin = (await api('/auth/login', { method: 'POST', body, headers: { 'X-Ayk-Scope': 'admin' } })).data;
    assert.equal(site.user.role, 'client', 'no admin tools in the site');
    assert.equal(admin.user.role, 'admin');
    assert.equal((await api('/auth/me', { token: site.token })).data.user.role, 'client');
    await api('/admin/dashboard', { token: site.token, expected: 403 });
    await api('/auth/logout', { token: admin.token, method: 'POST', headers: { 'X-Ayk-Scope': 'admin' } });
    await api('/auth/me', { token: admin.token, headers: { 'X-Ayk-Scope': 'admin' }, expected: 401 });
    await api('/auth/me', { token: site.token });
    const again = (await api('/auth/login', { method: 'POST', body, headers: { 'X-Ayk-Scope': 'admin' } })).data;
    await api('/auth/logout', { token: site.token, method: 'POST' });
    await api('/auth/me', { token: site.token, expected: 401 });
    assert.equal((await api('/auth/me', { token: again.token, headers: { 'X-Ayk-Scope': 'admin' } })).data.user.role, 'admin');
    // AYK-202: one sign-in; the site session of an admin account opens the admin area.
    const fresh = (await api('/auth/login', { method: 'POST', body })).data;
    assert.equal(fresh.user.admin_account, 1);
    // AYK-347: an administration account with no section granted neither sees nor opens it.
    assert.equal(fresh.user.admin_access, 0);
    await api('/auth/admin-session', { token: fresh.token, method: 'POST', headers: { 'X-Ayk-Scope': 'admin' }, expected: 403 });
    await db.query("UPDATE users SET permissions = '[\"users.manage\"]' WHERE id = ?", [user.id]);
    assert.equal((await api('/auth/me', { token: fresh.token })).data.user.admin_access, 1);
    const opened = (await api('/auth/admin-session', { token: fresh.token, method: 'POST', headers: { 'X-Ayk-Scope': 'admin' } })).data;
    assert.equal((await api('/auth/me', { token: opened.token, headers: { 'X-Ayk-Scope': 'admin' } })).data.user.role, 'admin');
    // AYK-358: the users list says how many sections each administration account enters, and never
    // sends the permissions themselves.
    const listed = (await api('/users?role=admin&limit=100', { token: opened.token, headers: { 'X-Ayk-Scope': 'admin' } })).data;
    const row = (listed.items || listed).find(item => Number(item.id) === Number(user.id));
    assert.ok(row, 'the account is in the administration list');
    assert.equal(row.admin_sections, 1);
    assert.equal(row.permissions, undefined);
    // AYK-359: a whole section opens its tabs (and tabs added later); every section opens all of
    // them; neither opens managing other administration accounts.
    const adminHeaders = { 'X-Ayk-Scope': 'admin' };
    await db.query("UPDATE users SET permissions = '[\"group:users\"]' WHERE id = ?", [user.id]);
    await api('/users?limit=1', { token: opened.token, headers: adminHeaders });
    await api('/admin/dashboard', { token: opened.token, headers: adminHeaders, expected: 403 });
    await api('/admin/permissions', { token: opened.token, headers: adminHeaders, expected: 403 });
    await db.query("UPDATE users SET permissions = '[\"*\"]' WHERE id = ?", [user.id]);
    await api('/admin/dashboard', { token: opened.token, headers: adminHeaders });
    await api('/admin/permissions', { token: opened.token, headers: adminHeaders, expected: 403 });
    const me = (await api('/auth/me', { token: opened.token, headers: adminHeaders })).data.user;
    assert.ok(me.permissions.includes('locations.manage') && !me.permissions.includes('admins.manage'), 'the tabs that «every section» opens today');
    // A member who manages administration accounts hands on only what is theirs.
    await db.query("UPDATE users SET permissions = '[\"group:geo\", \"admins.manage\"]' WHERE id = ?", [user.id]);
    const other = await db.query("INSERT INTO users (username, full_name, password_hash, role, permissions, is_active) VALUES (?, 'x', 'x', 'admin', '[]', 1) RETURNING id", [`perm${Date.now()}`]);
    const otherId = (other.rows || other)[0].id;
    await api(`/admin/users/${otherId}/permissions`, { token: opened.token, method: 'PUT', headers: adminHeaders, body: { permissions: ['*'] }, expected: 403 });
    await api(`/admin/users/${otherId}/permissions`, { token: opened.token, method: 'PUT', headers: adminHeaders, body: { permissions: ['group:geo'] } });
    await api(`/admin/users/${otherId}/permissions`, { token: opened.token, method: 'PUT', headers: adminHeaders, body: { permissions: ['group:users'] }, expected: 403 });
    await db.query('DELETE FROM users WHERE id = ?', [otherId]);
    await db.query("UPDATE users SET permissions = '[\"users.manage\"]' WHERE id = ?", [user.id]);
    // The admin session reaches admin routes (this test account has no extra permissions, so a
    // permission-gated page like the dashboard correctly stays closed).
    await api('/admin/dashboard', { token: opened.token, headers: { 'X-Ayk-Scope': 'admin' }, expected: 403 });
    await api('/admin/dashboard', { token: fresh.token, expected: 403 });
    await api('/auth/me', { token: fresh.token });
    const plain = await createUser();
    const plainLogin = (await api('/auth/login', { method: 'POST', body: { identifier: plain.username, password } })).data;
    await api('/auth/admin-session', { token: plainLogin.token, method: 'POST', headers: { 'X-Ayk-Scope': 'admin' }, expected: 403 });
    // AYK-240: the admin session is short (12 hours) and each admin sign-in is logged; the site keeps a year.
    const life = token => { const p = jwt.decode(token); return p.exp - p.iat; };
    assert.equal(life(opened.token), 12 * 3600);
    assert.equal(life(fresh.token), 365 * 24 * 3600);
    const logged = await db.query("SELECT COUNT(*) AS n FROM activity_logs WHERE user_id = ? AND action = 'admin_login'", [user.id]);
    assert.equal(Number(logged[0].n), 3);
  });

  test('AYK-208: five wrong passwords lock an account with a phone until an SMS reset', async () => {
    const phone = '05' + String(Date.now()).slice(-8);
    const user = await createUser('client', { phone });
    for (let i = 1; i < User.LOGIN_LOCK_AFTER; i += 1) assert.equal(await User.recordFailedLogin(user), false);
    assert.equal(await User.recordFailedLogin(user), true);
    assert.ok((await User.findByIdRaw(user.id)).login_locked_at);
    // Without a phone there is no SMS reset, so the account never locks (rate limits still apply).
    const noPhone = await createUser();
    for (let i = 0; i < User.LOGIN_LOCK_AFTER + 1; i += 1) assert.equal(await User.recordFailedLogin(noPhone), false);
    await User.clearFailedLogins(user.id);
    const row = await User.findByIdRaw(user.id);
    assert.equal(Number(row.failed_logins), 0);
    assert.equal(row.login_locked_at, null);
  });

  test('AYK-240: failed sign-ins, lockouts and locked sign-ins are logged without secrets', async () => {
    const phone = '05' + String(Date.now() + 7).slice(-8);
    const user = await createUser('client', { phone });
    const wrong = 'Wrong-Secret-Value-240';
    await db.query('DELETE FROM auth_rate_limits'); // earlier tests' attempts must not throttle this one
    for (let i = 1; i < User.LOGIN_LOCK_AFTER; i += 1) await api('/auth/login', { method: 'POST', body: { identifier: user.username, password: wrong }, expected: 401 });
    await api('/auth/login', { method: 'POST', body: { identifier: user.username, password: wrong }, expected: 423 });
    await api('/auth/login', { method: 'POST', body: { identifier: user.username, password }, expected: 423 });
    await api('/auth/login', { method: 'POST', body: { identifier: 'nobody_' + identity(), password: wrong }, expected: 401 });
    const rows = await db.query('SELECT action, description, ip_address FROM activity_logs WHERE user_id = ? ORDER BY id', [user.id]);
    assert.deepEqual(rows.map(r => r.action), [...Array(User.LOGIN_LOCK_AFTER - 1).fill('login_failed'), 'login_locked', 'login_while_locked']);
    assert.ok(rows.every(r => r.ip_address));
    const unknown = await db.query("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'login_failed' AND user_id IS NULL");
    assert.ok(Number(unknown[0].n) >= 1);
    const all = JSON.stringify(await db.query('SELECT * FROM activity_logs'));
    assert.ok(!all.includes(wrong) && !all.includes(password));
    await User.clearFailedLogins(user.id);
    await db.query('DELETE FROM auth_rate_limits'); // this test's attempts must not throttle the next ones
  });

  test('AYK-240: SQL injection text is treated as data in sign-in and public search', async () => {
    await db.query('DELETE FROM auth_rate_limits');
    for (const identifier of ["' OR '1'='1", "admin'--", "1; DROP TABLE users; --"]) {
      await api('/auth/login', { method: 'POST', body: { identifier, password: "' OR '1'='1" }, expected: 401 });
    }
    for (const search of ["' OR 1=1 --", "%' UNION SELECT password_hash FROM users --"]) {
      const { data } = await api(`/services?search=${encodeURIComponent(search)}`);
      assert.ok(!JSON.stringify(data).includes('$2'), 'no password hash leaks');
    }
    assert.ok(Number((await db.query('SELECT COUNT(*) AS n FROM users'))[0].n) > 0, 'users table intact');
    await db.query('DELETE FROM auth_rate_limits');
  });

  test('AYK-240: one address can ask for at most 10 SMS codes an hour, to any numbers', async () => {
    await db.query('DELETE FROM auth_rate_limits');
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(base + '/auth/phone-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '05' + String(10000000 + i * 7919), purpose: 'register' }) });
      statuses.push(response.status);
    }
    assert.ok(statuses.slice(0, 10).every(code => code !== 429), statuses.join(','));
    assert.equal(statuses[10], 429);
    await db.query('DELETE FROM auth_rate_limits');
  });

  test('AYK-240: reset codes expire, work once, and wrong guesses are capped per day across codes', async () => {
    const phoneCodes = require('../services/phoneCodeService');
    const { hashCode } = require('../models/UserVerification');
    const phone = '+9665' + String(Date.now()).slice(-8);
    const add = (code, minutes = 10) => db.query(`INSERT INTO phone_codes (phone, purpose, code_hash, max_attempts, expires_at)
      VALUES (?, 'reset', ?, 5, CURRENT_TIMESTAMP + (?::int * INTERVAL '1 minute'))`, [phone, hashCode(code), minutes]);
    await add('1234', -1); // already expired
    assert.equal((await phoneCodes.verifyCode({ phone, purpose: 'reset', code: '1234' })).reason, 'no_active_code');
    await add('2345');
    assert.equal((await phoneCodes.verifyCode({ phone, purpose: 'reset', code: '2345' })).ok, true);
    assert.equal((await phoneCodes.verifyCode({ phone, purpose: 'reset', code: '2345' })).ok, false, 'single use');
    // Ten wrong guesses over two codes; after that even the right code of a new one is refused today.
    for (let c = 0; c < 2; c += 1) {
      await add('9999');
      for (let i = 0; i < 5; i += 1) assert.equal((await phoneCodes.verifyCode({ phone, purpose: 'reset', code: '000' + i })).ok, false);
    }
    await add('4321');
    assert.deepEqual(await phoneCodes.verifyCode({ phone, purpose: 'reset', code: '4321' }), { ok: false, reason: 'max_attempts' });
  });

  test('AYK-242: security report sums server and site attempts per period, admins with the log permission only', async () => {
    process.env.GEOIP_DISABLE = '1';
    const now = Date.now();
    const at = h => new Date(now - h * 3600000);
    await db.query(`INSERT INTO security_events (source, event, status, ip, attempts, detail, first_at, last_at) VALUES
      ('ssh', 'ssh_failed', 'failed', '203.0.113.7', 40, 'root', ?, ?), ('ssh', 'ssh_failed', 'failed', '203.0.113.8', 2, 'admin', ?, ?),
      ('ssh', 'ssh_banned', 'blocked', '203.0.113.7', 1, 'fail2ban sshd', ?, ?), ('ssh', 'ssh_failed', 'failed', '203.0.113.9', 500, 'old', ?, ?)`,
      [at(2), at(1), at(3), at(3), at(1), at(1), at(24 * 40), at(24 * 40)]);
    await db.query("INSERT INTO activity_logs (action, entity_type, ip_address, created_at) VALUES ('login_failed', 'auth', '198.51.100.4', ?), ('rate_limited', 'auth', '198.51.100.4', ?)", [at(5), at(5)]);
    const admin = { token: tokenFor(fixtures.superA), headers: { 'X-Ayk-Scope': 'admin' } };
    const week = (await api('/admin/security-report?days=7', admin)).data;
    assert.equal(week.summary.ssh_failed, 42);
    assert.equal(week.summary.ssh_banned, 1);
    assert.ok(week.summary.site_failed >= 1 && week.summary.rate_limited >= 1);
    assert.ok(week.top_ips[0].ip === '203.0.113.7' && week.top_ips[0].attempts === 41);
    assert.ok(!week.events.some(e => e.ip === '203.0.113.9'), 'older than the period');
    assert.equal(week.daily.length >= 7, true);
    const old = new Date(now - 24 * 40 * 3600000).toISOString().slice(0, 10);
    const custom = (await api(`/admin/security-report?from=${old}&to=${old}&source=server`, admin)).data;
    assert.equal(custom.summary.ssh_failed, 500);
    assert.deepEqual(custom.range, { from: old, to: old, days: 1 });
    const limited = await createUser('admin');
    await db.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(['users.manage']), limited.id]);
    await api('/admin/security-report', { token: tokenFor(await User.findByIdRaw(limited.id)), headers: { 'X-Ayk-Scope': 'admin' }, expected: 403 });
    await api('/admin/security-report', { token: tokenFor(fixtures.client), expected: 403 });
  });

  test('AYK-244: visitor counter counts each visitor once a day, skips crawlers, and obeys the visibility setting', async () => {
    const visit = async (ua, token, headers = {}) => {
      const response = await fetch(base + '/visits', { method: 'POST', headers: { 'User-Agent': ua, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
      return (await response.json()).data;
    };
    // AYK-350: every entry counts; «still here» reports do not; a second entry within a minute is one.
    const enter = async (ua, entry) => {
      const response = await fetch(base + '/visits', { method: 'POST', headers: { 'User-Agent': ua, 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) });
      return (await response.json()).data;
    };
    const start = (await enter('Mozilla/5.0 Entry-A', false)).today;
    assert.equal((await enter('Mozilla/5.0 Entry-A', true)).today, start + 1, 'an entry counts');
    assert.equal((await enter('Mozilla/5.0 Entry-A', false)).today, start + 1, 'a still-here report does not');
    // AYK-507 (the owner): every entry counts, the same person again and again, with no waiting gap, and the
    // number in the answer already includes it.
    assert.equal((await enter('Mozilla/5.0 Entry-A', true)).today, start + 2, 'the same person entering again counts at once');
    assert.equal((await enter('Mozilla/5.0 Entry-A', true)).today, start + 3, 'and again (a reload)');
    assert.equal((await enter('Mozilla/5.0 Entry-A', false)).today, start + 3, 'a still-here report still does not');
    assert.equal((await enter('Mozilla/5.0 Entry-B', true)).today, start + 4);
    assert.equal((await enter('Googlebot/2.1', true)).today, start + 4, 'crawlers are not counted');
    const before = (await visit('Mozilla/5.0 Visitor-A')).today;
    assert.equal((await visit('Mozilla/5.0 Visitor-A')).today, before, 'the same visitor again is not counted');
    assert.equal((await visit('Mozilla/5.0 Visitor-B')).today, before + 1);
    assert.equal((await visit('Googlebot/2.1')).today, before + 1, 'crawlers are not counted');
    const shown = await visit('Mozilla/5.0 Visitor-B');
    assert.equal(shown.visible, true);
    assert.ok(shown.total >= shown.today && shown.online >= 2);

    // Hidden: the public sees nothing, an admin account still sees the counter.
    await db.query("UPDATE settings SET setting_value = 'false' WHERE setting_key = 'visitors_public'");
    assert.deepEqual(await visit('Mozilla/5.0 Visitor-C'), { visible: false });
    const admin = await visit('Mozilla/5.0 Admin', tokenFor(fixtures.superA), { 'X-Ayk-Scope': 'admin' });
    assert.equal(admin.visible, true);
    assert.equal(admin.today, before + 3, 'hidden counters still count (visitor C and the admin)');

    // Request views: once a day per viewer, the owner is not counted, hidden from the public.
    const owner = await createUser('client');
    const viewer = await createUser('provider');
    const [{ id }] = await db.query("INSERT INTO requests (client_id, title, description, status) VALUES (?, 'Views test', 'Views test request', 'open') RETURNING id", [owner.id]);
    const open = async (user, headers = {}) => (await api(`/requests/${id}`, { token: user ? tokenFor(user) : undefined, headers })).data;
    await open(owner); await open(viewer); await open(viewer);
    assert.equal(Number((await db.queryOne('SELECT views_count FROM requests WHERE id = ?', [id])).views_count), 1);
    assert.equal((await open(null)).views_count, undefined, 'hidden from the public');
    await db.query("UPDATE settings SET setting_value = 'true' WHERE setting_key = 'visitors_public'");
    assert.equal(Number((await open(null)).views_count), 2, 'shown once public (and the anonymous visit counted)');
  });

  test('password replacement revokes existing sessions and preserves full long passwords', async () => {
    const user = await createUser(), token = tokenFor(user), nextPassword = 'a'.repeat(72) + 'first';
    const changed = (await api('/auth/password', { token, method: 'PUT', body: { current_password: password, new_password: nextPassword } })).data;
    await api('/auth/me', { token, expected: 401 });
    // This device stays signed in with the new session it was given (AYK-216).
    await api('/auth/me', { token: changed.token });
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

  // AYK-151: the admin area and the site (or the app on the same phone) never share a session.
  test('the admin area keeps its own cookie and never links device notifications', async () => {
    const user = await createUser(), token = tokenFor(user);
    const site = (await api('/auth/me', { token })).response.headers.get('set-cookie') || '';
    const admin = (await api('/auth/me', { token, headers: { 'X-Ayk-Scope': 'admin' } })).response.headers.get('set-cookie') || '';
    assert.match(site, /(^|,\s*)token=/);
    assert.doesNotMatch(site, /admin_token=/);
    assert.match(admin, /(^|,\s*)admin_token=/);
    assert.doesNotMatch(admin, /(^|,\s*)token=/);
    const adminMedia = await runAuth(authenticate, token, { headers: {}, get: name => (name === 'referer' ? 'https://aykdmh.com/admin/users' : undefined), cookies: { admin_token: token }, originalUrl: '/api/media/00000000-0000-4000-8000-000000000000' });
    assert.equal(adminMedia.nextCalled, true);
    const siteMedia = await runAuth(authenticate, token, { headers: {}, cookies: { admin_token: token }, originalUrl: '/api/media/00000000-0000-4000-8000-000000000000' });
    assert.equal(siteMedia.nextCalled, false, 'a site page never uses the admin cookie');
    const linked = await api('/push/native', { token, method: 'POST', headers: { 'X-Ayk-Scope': 'admin' }, body: { token: 'f'.repeat(140), app_version: '1.3.1' } });
    assert.equal(linked.data.subscribed, false);
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

  test('AYK-383: a provider who is also in the administration is a provider on the site and the administration only in /admin', async () => {
    await authLimiter.resetKey('127.0.0.1');
    const user = await createUser('provider');
    await db.query(`UPDATE users SET is_admin = 1, permissions = '["users.manage"]' WHERE id = ?`, [user.id]);
    const body = { identifier: user.username, password };
    const site = (await api('/auth/login', { method: 'POST', body })).data;
    assert.equal(site.user.role, 'provider', 'on the site: a provider');
    assert.equal(site.user.admin_access, 1, 'with the way into the administration');
    assert.equal(site.user.is_super_admin, 0);
    assert.deepEqual(site.user.permissions, []);
    // As a provider, freely: the work settings (here the business name) are saved.
    await api('/users/me/provider', { token: site.token, method: 'PUT', body: { business_name: 'Both At Once' } });
    assert.equal((await User.getProviderProfile(user.id)).business_name, 'Both At Once');
    // No administration from the site session.
    await api('/admin/dashboard', { token: site.token, expected: 403 });
    await api('/users?limit=5', { token: site.token, expected: 403 });
    // In the administration: the administration only, with its own sections.
    const admin = (await api('/auth/login', { method: 'POST', body, headers: { 'X-Ayk-Scope': 'admin' } })).data;
    assert.equal(admin.user.role, 'admin');
    await api('/users?limit=5', { token: admin.token, headers: { 'X-Ayk-Scope': 'admin' } });
    // The admin session never edits its own site self as a provider.
    await api('/users/me/provider', { token: admin.token, method: 'PUT', headers: { 'X-Ayk-Scope': 'admin' }, body: { business_name: 'From Admin' }, expected: 403 });
    assert.equal((await User.getProviderProfile(user.id)).business_name, 'Both At Once');
    // On the site it is still listed among providers in public.
    assert.equal((await api(`/users/${user.id}`)).data.user.role, 'provider');
    // Changing the site role does not touch the administration's rights.
    const raw = await User.findByIdRaw(user.id);
    assert.equal(Number(raw.is_admin), 1);
  });

  test('concurrent super-admin demotions preserve one active super administrator', async () => {
    const users = await db.query("SELECT id FROM users WHERE (role='admin' OR is_admin=1) AND is_super_admin=1 AND is_active=1 AND is_blocked=0 AND deleted_at IS NULL");
    assert.equal(users.length, 2);
    const attempts = await Promise.all([fixtures.superA, fixtures.superB].map(async user => {
      const response = await fetch(`${base}/admin/users/${user.id}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(user)}` }, body: JSON.stringify({ is_super_admin: false, permissions: [] }) });
      await response.json(); return response.status;
    }));
    assert.deepEqual(attempts.sort((a, b) => a - b), [200, 400]);
    const row = await db.queryOne("SELECT COUNT(*) AS total FROM users WHERE (role='admin' OR is_admin=1) AND is_super_admin=1 AND is_active=1 AND is_blocked=0 AND deleted_at IS NULL");
    assert.equal(Number(row.total), 1);
  });
}
