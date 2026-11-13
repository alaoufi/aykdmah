// AYK-013: test-mode checkout. Subscribe → test checkout → activation and coupon
// commission, with no money moving; owner-only, single settlement, and no bank
// withdrawals while in test mode. Disposable localhost database only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.AYK_PAYTEST_TEST_DB;

if (!databasePrefix) {
  test('test-mode payments integration (set AYK_PAYTEST_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_paytest[a-z0-9_]{0,20}$/.test(databasePrefix)) throw new Error('Use a disposable ayk_test_paytest* database prefix.');
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '100000', PAYMENT_PROVIDER: 'test',
    APP_URL: 'https://aykdmh.test.invalid',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const env = require('../config/env');
  const jwt = require('../utils/jwt');
  const { hashPassword } = require('../utils/hash');
  const wallet = require('../services/walletService');
  const PASSWORD = 'pass1234';
  let server, base, createdDatabase = false;
  const users = {};

  const admin = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  async function api(route, { user, method = 'GET', body } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  async function makeUser(name, role, extra = {}) {
    const hash = await hashPassword(PASSWORD);
    const row = await db.query('INSERT INTO users (full_name, username, password_hash, role, is_super_admin) VALUES (?, ?, ?, ?, ?)',
      [name, name, hash, role, extra.superAdmin ? 1 : 0]);
    if (role === 'provider') await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [row.insertId]);
    users[name] = { id: row.insertId, role, token: jwt.sign({ id: row.insertId, role, auth_version: 0 }) };
    return users[name];
  }
  async function checkout(user) {
    const sub = await api('/subscriptions', { user, method: 'POST', body: { plan_id: 2 } });
    assert.equal(sub.status, 201, sub.body?.message);
    const session = await api('/payments/session', { user, method: 'POST', body: { subscription_id: sub.body.data.id, payment_method: 'card' } });
    assert.equal(session.status, 200, session.body?.message);
    return { subscriptionId: sub.body.data.id, ...session.body.data };
  }

  test.before(async () => {
    const client = admin();
    await client.connect();
    try { await client.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await client.end(); }
    const setup = await require('../services/installService').setupFromEnv();
    assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
    await db.query('UPDATE subscription_plans SET price = 40, duration_days = 30, is_active = 1 WHERE id = 2');
    await makeUser('referrer', 'provider');
    await makeUser('newcomer', 'provider');
    await makeUser('stranger', 'provider');
    await makeUser('boss', 'admin', { superAdmin: true });
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
    await api('/wallet/admin/settings', { user: users.boss, method: 'PUT', body: { commission_percent: 10, min_withdrawal: 1 } });
    await api('/wallet/coupon', { user: users.newcomer, method: 'POST', body: { code: await wallet.ensureReferralCode(users.referrer.id) } });
  });

  test.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const client = admin();
      await client.connect();
      await client.query(`DROP DATABASE "${databaseName}"`);
      await client.end();
    }
  });

  test('checkout points to the internal test page and only the owner can see or settle it', async () => {
    const session = await checkout(users.newcomer);
    assert.equal(session.test, true);
    assert.equal(session.checkout_url, `https://aykdmh.test.invalid/payments/test/${session.payment_id}`);
    assert.equal((await api(`/payments/test/${session.payment_id}`, { user: users.stranger })).status, 404);
    assert.equal((await api(`/payments/test/${session.payment_id}/complete`, { user: users.stranger, method: 'POST' })).status, 404);
    const view = await api(`/payments/test/${session.payment_id}`, { user: users.newcomer });
    assert.deepEqual([view.body.data.amount, view.body.data.status, view.body.data.test], [40, 'processing', true]);
    // Cancelling frees the account to subscribe again.
    assert.equal((await api(`/payments/test/${session.payment_id}/cancel`, { user: users.newcomer, method: 'POST' })).status, 200);
    const sub = await db.queryOne('SELECT status FROM subscriptions WHERE id = ?', [session.subscriptionId]);
    assert.equal(sub.status, 'cancelled');
    assert.equal((await api(`/payments/test/${session.payment_id}/complete`, { user: users.newcomer, method: 'POST' })).body.message, 'payment_not_open');
  });

  test('completing a test payment activates the subscription and pays the coupon commission once', async () => {
    const session = await checkout(users.newcomer);
    const done = await api(`/payments/test/${session.payment_id}/complete`, { user: users.newcomer, method: 'POST' });
    assert.equal(done.status, 200, done.body?.message);
    const sub = await db.queryOne('SELECT status, ends_at FROM subscriptions WHERE id = ?', [session.subscriptionId]);
    assert.equal(sub.status, 'active');
    assert.ok(new Date(sub.ends_at) > new Date());
    const payment = await db.queryOne('SELECT status, provider FROM payments WHERE id = ?', [session.payment_id]);
    assert.deepEqual([payment.status, payment.provider], ['completed', 'test']);
    const summary = (await api('/wallet', { user: users.referrer })).body.data;
    assert.equal(summary.balance, 4);
    assert.equal(summary.test_mode, true);
    assert.equal((await db.queryOne("SELECT note FROM wallet_transactions WHERE type = 'referral_commission'")).note, 'test');
    // A second settlement attempt changes nothing.
    assert.equal((await api(`/payments/test/${session.payment_id}/complete`, { user: users.newcomer, method: 'POST' })).body.message, 'payment_not_open');
    assert.equal((await api('/wallet', { user: users.referrer })).body.data.balance, 4);
  });

  test('test-mode balances can never be withdrawn to a bank', async () => {
    const ask = await api('/wallet/withdrawals', { user: users.referrer, method: 'POST',
      body: { amount: 2, iban: 'SA0380000000608010167519', account_name: 'Referrer Name', password: PASSWORD } });
    assert.equal(ask.status, 409);
    assert.equal(ask.body.message, 'test_mode_withdrawals_disabled');
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM withdrawal_requests')).n), 0);
  });

  test('the test endpoints refuse everything when test mode is off', async () => {
    const session = await checkout(users.stranger);
    const saved = env.PAYMENT.PROVIDER;
    env.PAYMENT.PROVIDER = '';
    try {
      assert.equal((await api(`/payments/test/${session.payment_id}`, { user: users.stranger })).status, 404);
      assert.equal((await api(`/payments/test/${session.payment_id}/complete`, { user: users.stranger, method: 'POST' })).status, 404);
      assert.equal((await db.queryOne('SELECT status FROM payments WHERE id = ?', [session.payment_id])).status, 'processing');
    } finally { env.PAYMENT.PROVIDER = saved; }
  });
}
