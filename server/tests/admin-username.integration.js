// Only this newly generated localhost database is created, used and dropped.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const path = require('node:path');

if (process.env.AYK_ADMIN_USERNAME_TEST !== '1') {
  test('administrator username integration (set AYK_ADMIN_USERNAME_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_adminusername_${crypto.randomBytes(10).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || 55432);
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
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const User = require('../models/User');
  const install = require('../services/installService');
  const { hashPassword } = require('../utils/hash');
  const { assignAdminUsername, buildAdminUsernameQueries } = require('../services/adminUsernameService');
  let server, base, createdDatabase = false, passwordHash;
  const password = 'Disposable-Admin-Username-2026';
  const connection = database => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database, ssl: false });
  async function fixture(role = 'admin', extra = {}) {
    const id = await User.create({ full_name: 'Local Administrator Test', email: `admin_${crypto.randomBytes(6).toString('hex')}@example.invalid`, password_hash: passwordHash, role, ...extra });
    return User.findByIdRaw(id);
  }
  async function assign(adminId, username, apply = false) {
    const client = connection(databaseName);
    await client.connect();
    try { return await assignAdminUsername(client, { adminId, username, apply }); }
    finally { await client.end(); }
  }
  async function api(route, { token, body, expected = 200 } = {}) {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  }
  const identityState = user => Object.fromEntries(['id', 'password_hash', 'auth_version', 'role', 'is_super_admin', 'permissions', 'email', 'phone', 'full_name', 'is_active', 'is_blocked'].map(key => [key, user[key]]));

  test.before(async () => {
    const maintenance = connection('postgres');
    await maintenance.connect();
    try { await maintenance.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; }
    finally { await maintenance.end(); }
    const result = await install.setupFromEnv();
    assert.equal(result.migrations.flatMap(item => item.errors).length, 0);
    passwordHash = await hashPassword(password);
    server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const maintenance = connection('postgres');
      await maintenance.connect();
      try { await maintenance.query(`DROP DATABASE "${databaseName}"`); }
      finally { await maintenance.end(); }
    }
  });
  test.beforeEach(async () => { await db.query('DELETE FROM auth_rate_limits'); });

  test('adding an admin username preserves its password, role and existing session, and still requires the correct password', async () => {
    const admin = await fixture();
    await db.query('UPDATE users SET is_super_admin = 1 WHERE id = ?', [admin.id]);
    const existingLogin = await api('/auth/login', { body: { identifier: admin.email, password } });
    const before = identityState(await User.findByIdRaw(admin.id));
    const userCount = Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total);
    assert.equal((await assign(admin.id, 'aykdmh_admin')).status, 'ready');
    assert.equal((await User.findByIdRaw(admin.id)).username, null);
    assert.equal((await assign(admin.id, 'aykdmh_admin', true)).status, 'assigned');
    assert.deepEqual(identityState(await User.findByIdRaw(admin.id)), before);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total), userCount);
    assert.equal((await api('/auth/me', { token: existingLogin.token })).user.username, 'aykdmh_admin');
    await api('/auth/login', { body: { identifier: 'aykdmh_admin', password: 'Wrong-Disposable-Password' }, expected: 401 });
    const login = await api('/auth/login', { body: { identifier: 'aykdmh_admin', password } });
    assert.equal(Number(login.user.id), Number(admin.id));
    assert.equal(login.user.role, 'admin');
    assert.equal(Number((await api('/auth/login', { body: { identifier: admin.email, password } })).user.id), Number(admin.id));
    assert.equal((await assign(admin.id, 'aykdmh_admin', true)).status, 'unchanged');
    assert.deepEqual(identityState(await User.findByIdRaw(admin.id)), before);
  });

  test('existing usernames and non-admin, blocked or nonexistent accounts are never replaced or promoted', async () => {
    const admin = await fixture('admin', { username: 'established_admin' });
    assert.equal((await assign(admin.id, 'other_admin', true)).status, 'existing_username');
    assert.equal((await User.findByIdRaw(admin.id)).username, 'established_admin');
    const client = await fixture('client');
    assert.equal((await assign(client.id, 'client_as_admin', true)).status, 'invalid_admin');
    assert.equal((await User.findByIdRaw(client.id)).role, 'client');
    assert.equal((await User.findByIdRaw(client.id)).username, null);
    const blocked = await fixture();
    await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [blocked.id]);
    assert.equal((await assign(blocked.id, 'blocked_admin', true)).status, 'invalid_admin');
    assert.equal((await assign(2147483647, 'missing_admin', true)).status, 'invalid_admin');
  });

  test('cross-field and deleted-account identifier collisions cannot create an ambiguous admin login', async () => {
    const admin = await fixture();
    await fixture('client', { facebook_id: 'shared_admin_name' });
    assert.equal((await assign(admin.id, 'shared_admin_name', true)).status, 'identifier_conflict');
    const deleted = await fixture('client', { username: 'deleted_reserved_name' });
    await db.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [deleted.id]);
    assert.equal((await assign(admin.id, 'deleted_reserved_name', true)).status, 'identifier_conflict');
    assert.equal((await User.findByIdRaw(admin.id)).username, null);
    for (const username of ['0501234567', '+966501234567', 'admin@example.invalid', 'a', 'bad username']) {
      assert.throws(() => buildAdminUsernameQueries({ adminId: admin.id, username, apply: true }));
    }
  });

  test('concurrent assignments of one username produce exactly one owner', async () => {
    const first = await fixture(), second = await fixture();
    const results = await Promise.all([assign(first.id, 'unique_concurrent_admin', true), assign(second.id, 'unique_concurrent_admin', true)]);
    assert.deepEqual(results.map(item => item.status).sort(), ['assigned', 'identifier_conflict']);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM users WHERE username = ?', ['unique_concurrent_admin'])).total), 1);
  });

  test('the trusted CLI defaults to a dry run and prints only the proposed identifier and account ID', async () => {
    const admin = await fixture();
    const { stdout, stderr } = await execFile(process.execPath, [path.resolve(__dirname, '../scripts/assign-admin-username.js'), '--admin-id', String(admin.id), '--username', 'planned_cli_admin'], { env: { ...process.env } });
    assert.equal(stderr, '');
    assert.deepEqual(JSON.parse(stdout), { admin_id: Number(admin.id), username: 'planned_cli_admin', status: 'ready' });
    assert.equal((await User.findByIdRaw(admin.id)).username, null);
  });
}
