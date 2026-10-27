// Referral coupons and wallets: code format, coupon linking, first-payment commission,
// withdrawals, paid gifts, concurrency and admin controls. Disposable localhost database only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.AYK_WALLET_TEST_DB;

if (!databasePrefix) {
  test('wallet integration (set AYK_WALLET_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_wallet[a-z0-9_]{0,20}$/.test(databasePrefix)) throw new Error('Use a disposable ayk_test_wallet* database prefix.');
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '100000',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const jwt = require('../utils/jwt');
  const { hashPassword } = require('../utils/hash');
  const Payment = require('../models/Payment');
  const wallet = require('../services/walletService');
  const PASSWORD = 'pass1234';
  const IBAN = 'SA0380000000608010167519';
  let server, base, createdDatabase = false, planId, passwordHash;
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
    const row = await db.query(`INSERT INTO users (full_name, username, phone, password_hash, role, is_super_admin, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [name, name, `+9665${String(Object.keys(users).length).padStart(8, '0')}`, passwordHash, role,
      extra.superAdmin ? 1 : 0, extra.permissions ? JSON.stringify(extra.permissions) : null]);
    if (role === 'provider') await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [row.insertId]);
    const user = { id: row.insertId, role, token: jwt.sign({ id: row.insertId, role, auth_version: 0 }) };
    users[name] = user;
    return user;
  }
  const balance = async user => (await api('/wallet', { user })).body.data.balance;
  // A gateway payment exactly as the payment webhook would settle it.
  let txCounter = 0;
  async function gatewayPayment(user, amount) {
    const sub = await db.query("INSERT INTO subscriptions (user_id, plan_id, status, amount) VALUES (?, ?, 'pending', ?)", [user.id, planId, amount]);
    const transactionId = `gw-${++txCounter}-${crypto.randomBytes(4).toString('hex')}`;
    await db.query(`INSERT INTO payments (user_id, subscription_id, provider, provider_transaction_id, amount, currency, status)
      VALUES (?, ?, 'testgateway', ?, ?, 'SAR', 'pending')`, [user.id, sub.insertId, transactionId, amount]);
    const settle = () => Payment.settleVerified({ authenticated: true, transaction_id: transactionId, provider: 'testgateway', currency: 'SAR', amount, status: 'completed' });
    const result = await settle();
    return { result, settle, subscriptionId: sub.insertId };
  }
  const expire = user => db.query("UPDATE subscriptions SET status = 'expired' WHERE user_id = ?", [user.id]);

  test.before(async () => {
    const client = admin();
    await client.connect();
    try { await client.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await client.end(); }
    const setup = await require('../services/installService').setupFromEnv();
    assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
    passwordHash = await hashPassword(PASSWORD);
    planId = (await db.queryOne('SELECT id FROM subscription_plans WHERE id = 2')).id;
    await db.query('UPDATE subscription_plans SET price = 40, duration_days = 30, is_active = 1 WHERE id = 2');
    await makeUser('referrer', 'provider');
    await makeUser('newcomer', 'provider');
    await makeUser('other', 'provider');
    await makeUser('customer', 'client');
    await makeUser('boss', 'admin', { superAdmin: true });
    await makeUser('limitedadmin', 'admin', { permissions: ['dashboard.view'] });
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
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

  test('every provider gets one permanent coupon code: 2 letters + 2 digits, no I or O', async () => {
    const first = await api('/wallet', { user: users.referrer });
    assert.equal(first.status, 200, first.body?.message);
    const code = first.body.data.referral_code;
    assert.match(code, /^[A-HJ-NP-Z]{2}\d{2}$/);
    assert.equal((await api('/wallet', { user: users.referrer })).body.data.referral_code, code);
    assert.equal((await api('/wallet', { user: users.customer })).status, 403, 'clients have no wallet');
    const codes = new Set();
    for (let i = 0; i < 40; i += 1) {
      const u = await makeUser(`bulk${i}`, 'provider');
      codes.add(await wallet.ensureReferralCode(u.id));
    }
    assert.equal(codes.size, 40, 'codes are unique');
  });

  test('registration validates the coupon before creating the account', async () => {
    const before = Number((await db.queryOne('SELECT COUNT(*) AS n FROM users')).n);
    const bad = await api('/auth/register', { method: 'POST', body: { full_name: 'Typo User', username: 'typouser', password: 'abcd', role: 'client', referral_code: 'ZZ00' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, 'coupon_not_found');
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM users')).n), before);
    const code = (await api('/wallet', { user: users.referrer })).body.data.referral_code;
    const good = await api('/auth/register', { method: 'POST', body: { full_name: 'Coupon User', username: 'couponuser', password: 'abcd', role: 'client', referral_code: code.toLowerCase() } });
    assert.equal(good.status, 201, good.body?.message);
    const row = await db.queryOne('SELECT referred_by FROM users WHERE username = ?', ['couponuser']);
    assert.equal(Number(row.referred_by), users.referrer.id);
  });

  test('a coupon can be applied once, not to oneself, and not after paying', async () => {
    const code = (await api('/wallet', { user: users.referrer })).body.data.referral_code;
    assert.equal((await api('/wallet/coupon', { user: users.referrer, method: 'POST', body: { code } })).body.message, 'coupon_own');
    assert.equal((await api('/wallet/coupon', { user: users.newcomer, method: 'POST', body: { code: 'XX99' } })).status, 404);
    assert.equal((await api('/wallet/coupon', { user: users.newcomer, method: 'POST', body: { code } })).status, 200);
    assert.equal((await api('/wallet/coupon', { user: users.newcomer, method: 'POST', body: { code } })).body.message, 'coupon_already_used');
    const otherCode = (await api('/wallet', { user: users.other })).body.data.referral_code;
    const payer = await makeUser('paidfirst', 'provider');
    await gatewayPayment(payer, 40);
    assert.equal((await api('/wallet/coupon', { user: payer, method: 'POST', body: { code: otherCode } })).body.message, 'coupon_after_payment');
  });

  test('the referrer earns the configured percent of the FIRST gateway payment only, exactly once', async () => {
    assert.equal((await api('/wallet/admin/settings', { user: users.boss, method: 'PUT', body: { commission_percent: 12.5 } })).status, 200);
    const startBalance = await balance(users.referrer);
    const first = await gatewayPayment(users.newcomer, 40);
    assert.equal(first.result.reward.amount, 5);
    assert.equal(await balance(users.referrer), startBalance + 5);
    // Replayed webhook: no second commission.
    const replay = await first.settle();
    assert.equal(replay.changed, false);
    assert.equal(await balance(users.referrer), startBalance + 5);
    // Renewal: no commission.
    await expire(users.newcomer);
    await gatewayPayment(users.newcomer, 40);
    assert.equal(await balance(users.referrer), startBalance + 5);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM referral_rewards WHERE referred_user_id = ?', [users.newcomer.id])).n), 1);
    const summary = (await api('/wallet', { user: users.referrer })).body.data;
    assert.equal(summary.referrals.paid, 1);
    assert.equal(summary.earned, startBalance + 5);
  });

  test('commission rounds down to the halala', async () => {
    await api('/wallet/admin/settings', { user: users.boss, method: 'PUT', body: { commission_percent: 7 } });
    const code = (await api('/wallet', { user: users.other })).body.data.referral_code;
    const referred = await makeUser('oddamount', 'provider');
    await api('/wallet/coupon', { user: referred, method: 'POST', body: { code } });
    const { result } = await gatewayPayment(referred, 39.99);
    assert.equal(result.reward.amount, 2.79);
    const reward = await db.queryOne('SELECT amount, percent, payment_amount FROM referral_rewards WHERE referred_user_id = ?', [referred.id]);
    assert.deepEqual([Number(reward.amount), Number(reward.percent), Number(reward.payment_amount)], [2.79, 7, 39.99]);
  });

  test('withdrawals: password, IBAN, minimum, hold, single pending, reject releases, paid needs a reference', async () => {
    await api('/wallet/admin/settings', { user: users.boss, method: 'PUT', body: { min_withdrawal: 3 } });
    const start = await balance(users.referrer);
    const ask = body => api('/wallet/withdrawals', { user: users.referrer, method: 'POST', body: { amount: 3, iban: IBAN, account_name: 'Referrer Name', password: PASSWORD, ...body } });
    assert.equal((await ask({ password: 'wrong' })).body.message, 'wrong_password');
    assert.equal((await ask({ amount: 2 })).body.message, 'below_minimum');
    assert.equal((await ask({ iban: 'GB00123' })).body.message, 'invalid_iban');
    assert.equal((await ask({ amount: '3.001' })).body.message, 'invalid_amount');
    assert.equal((await ask({ amount: start + 1 })).body.message, 'insufficient_balance');
    const ok = await ask({});
    assert.equal(ok.status, 200, ok.body?.message);
    assert.equal(await balance(users.referrer), start - 3, 'funds are held while pending');
    assert.equal((await ask({})).body.message, 'withdrawal_pending');
    const id = ok.body.data.id;
    assert.equal((await api(`/wallet/admin/withdrawals/${id}`, { user: users.boss, method: 'POST', body: { action: 'paid' } })).body.message, 'transfer_reference_required');
    assert.equal((await api(`/wallet/admin/withdrawals/${id}`, { user: users.boss, method: 'POST', body: { action: 'rejected', note: 'IBAN name mismatch' } })).status, 200);
    assert.equal(await balance(users.referrer), start, 'rejection releases the hold');
    assert.equal((await api(`/wallet/admin/withdrawals/${id}`, { user: users.boss, method: 'POST', body: { action: 'paid', transfer_reference: 'TRX-1' } })).body.message, 'withdrawal_not_pending');
    const second = await ask({});
    assert.equal((await api(`/wallet/admin/withdrawals/${second.body.data.id}`, { user: users.boss, method: 'POST', body: { action: 'paid', transfer_reference: 'BANK-778899' } })).status, 200);
    assert.equal(await balance(users.referrer), start - 3);
    const row = await db.queryOne('SELECT status, transfer_reference, processed_by FROM withdrawal_requests WHERE id = ?', [second.body.data.id]);
    assert.deepEqual({ ...row, processed_by: Number(row.processed_by) }, { status: 'paid', transfer_reference: 'BANK-778899', processed_by: users.boss.id });
    // The user only ever sees the last four IBAN digits.
    const listed = (await api('/wallet', { user: users.referrer })).body.data.withdrawals[0];
    assert.equal(listed.iban_last4, IBAN.slice(-4));
    assert.equal(listed.iban, undefined);
  });

  test('concurrent withdrawals cannot spend the same money twice', async () => {
    const rich = await makeUser('richone', 'provider');
    await api(`/wallet/admin/users/${rich.id}/adjust`, { user: users.boss, method: 'POST', body: { amount: '10', note: 'Test credit for race' } });
    const results = await Promise.all(Array.from({ length: 6 }, () => api('/wallet/withdrawals', {
      user: rich, method: 'POST', body: { amount: 10, iban: IBAN, account_name: 'Rich One', password: PASSWORD } })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(await balance(rich), 0);
  });

  test('gift a subscription: password, recipient checks, balance, activation, no commission loop', async () => {
    const giver = await makeUser('giver', 'provider');
    const receiver = await makeUser('receiver', 'provider');
    // The receiver was referred: a wallet-paid subscription must not earn their referrer anything.
    const referrerCode = (await api('/wallet', { user: users.other })).body.data.referral_code;
    await api('/wallet/coupon', { user: receiver, method: 'POST', body: { code: referrerCode } });
    const otherBefore = await balance(users.other);
    const receiverCode = await wallet.ensureReferralCode(receiver.id);
    const gift = body => api('/wallet/gift', { user: giver, method: 'POST', body: { recipient: receiverCode, plan_id: planId, password: PASSWORD, ...body } });
    assert.equal((await gift({})).body.message, 'insufficient_balance');
    await api(`/wallet/admin/users/${giver.id}/adjust`, { user: users.boss, method: 'POST', body: { amount: '100', note: 'Test credit for gift' } });
    assert.equal((await gift({ password: 'nope' })).body.message, 'wrong_password');
    assert.equal((await gift({ recipient: await wallet.ensureReferralCode(giver.id) })).body.message, 'recipient_self');
    assert.equal((await gift({ recipient: 'customer' })).body.message, 'recipient_not_found');
    const preview = await api('/wallet/gift/preview', { user: giver, method: 'POST', body: { recipient: receiverCode, plan_id: planId } });
    assert.equal(preview.body.data.recipient.id, receiver.id);
    const done = await gift({});
    assert.equal(done.status, 200, done.body?.message);
    assert.equal(await balance(giver), 60);
    const sub = await db.queryOne("SELECT status, ends_at FROM subscriptions WHERE user_id = ? AND status = 'active'", [receiver.id]);
    assert.ok(sub && new Date(sub.ends_at) > new Date());
    const payment = await db.queryOne("SELECT provider, status, amount FROM payments WHERE user_id = ?", [receiver.id]);
    assert.deepEqual([payment.provider, payment.status, Number(payment.amount)], ['wallet', 'completed', 40]);
    assert.equal(await balance(users.other), otherBefore, 'wallet payments never earn commission');
    assert.equal((await gift({})).body.message, 'recipient_has_subscription');
  });

  test('concurrent gifts cannot overdraw the balance', async () => {
    const giver = await makeUser('racegiver', 'provider');
    await api(`/wallet/admin/users/${giver.id}/adjust`, { user: users.boss, method: 'POST', body: { amount: '40', note: 'Test credit for one gift' } });
    const recipients = [];
    for (let i = 0; i < 4; i += 1) recipients.push(await wallet.ensureReferralCode((await makeUser(`racerecv${i}`, 'provider')).id));
    const results = await Promise.all(recipients.map(recipient => api('/wallet/gift', {
      user: giver, method: 'POST', body: { recipient, plan_id: planId, password: PASSWORD } })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(await balance(giver), 0);
  });

  test('admin controls need the wallets permission; adjustments need a reason and cannot overdraw', async () => {
    assert.equal((await api('/wallet/admin', { user: users.customer })).status, 403);
    assert.equal((await api('/wallet/admin', { user: users.limitedadmin })).status, 403);
    const overview = await api('/wallet/admin', { user: users.boss });
    assert.equal(overview.status, 200);
    assert.ok(overview.body.data.withdrawals.length >= 2);
    assert.ok(overview.body.data.rewards.length >= 2);
    const target = users.referrer;
    assert.equal((await api(`/wallet/admin/users/${target.id}/adjust`, { user: users.boss, method: 'POST', body: { amount: '5', note: 'x' } })).body.message, 'note_required');
    assert.equal((await api(`/wallet/admin/users/${target.id}/adjust`, { user: users.boss, method: 'POST', body: { amount: '-100000', note: 'Too large debit' } })).body.message, 'insufficient_balance');
    assert.equal((await api('/wallet/admin/settings', { user: users.boss, method: 'PUT', body: { commission_percent: 101 } })).body.message, 'invalid_percent');
    const ledger = await api(`/wallet/admin/users/${target.id}`, { user: users.boss });
    const sum = ledger.body.data.filter(t => t.status !== 'cancelled').reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0) / 100;
    assert.equal(sum, await balance(target), 'balance always equals the ledger');
  });
}
