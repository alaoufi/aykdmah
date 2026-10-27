// This suite owns one new database on the local review PostgreSQL service.
// It cannot use an application URL, credentials, payment adapter or mail server.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databaseName = `ayk_test_finance_${crypto.randomBytes(10).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '10000',
  DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432',
  DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_USERNAME: '',
  RESET_KEY: '', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '',
  WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
});
// Older revisions of env.js also remain isolated from credential files.
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const install = require('../services/installService');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Ad = require('../models/Ad');
const ProviderBadge = require('../models/ProviderBadge');
const Pricing = require('../models/AdPlacementPricing');
const Setting = require('../models/Setting');
const adService = require('../services/adRequestService');
const badgeService = require('../services/badgeService');
const paymentService = require('../services/paymentService');
const { sign } = require('../utils/jwt');
let createdDatabase = false, server, base, sequence = 0;
const users = {};
const maintenance = () => new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 });
async function makeUser(role = 'provider', permissions = []) {
  const username = `finance_${++sequence}_${crypto.randomBytes(4).toString('hex')}`;
  const result = await db.query('INSERT INTO users (full_name, username, password_hash, role, is_active, permissions) VALUES (?, ?, ?, ?, 1, ?)', ['Local finance fixture', username, 'no-login-fixture', role, JSON.stringify(permissions)]);
  const user = { id: result.insertId, role, permissions, token: sign({ id: result.insertId, role, auth_version: 0 }) };
  if (role === 'provider') await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [user.id]);
  return user;
}
async function api(route, { user, body, method = 'GET', expected = 200 } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${route}: ${result.message || JSON.stringify(result)}`);
  return result.data;
}
async function plan({ price = 50, active = true, featured = false } = {}) {
  return Subscription.createPlan({ name_ar: 'Local finance plan', slug: `finance_plan_${++sequence}`, price, duration_days: 30, is_active: active, is_featured: featured });
}
async function syntheticPayment(user, amount, extra = {}) {
  // A local database fixture, never a gateway call or actual charge.
  const p = await Payment.create({ user_id: user.id, provider: 'verified_local_fixture', amount, metadata: {}, ...extra });
  return Payment.updateStatus(p.id, 'completed', `local_fixture_${crypto.randomBytes(10).toString('hex')}`);
}
async function userAd(user = users.provider, extra = {}) {
  return Ad.create({ user_id: user.id, title: 'Local ad', image: 'https://example.invalid/ad.jpg', placement: 'home_top', placements: ['home_top'], duration_days: 2, max_views: 500, amount: 33, status: 'approved', is_active: false, ...extra });
}
test.before(async () => {
  const admin = maintenance();
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; }
  finally { await admin.end(); }
  const setup = await install.setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  await db.query('DELETE FROM ads');
  users.provider = await makeUser();
  users.other = await makeUser();
  users.client = await makeUser('client');
  users.admin = await makeUser('admin');
  users.adsAdmin = await makeUser('admin', ['ads.manage']);
  server = require('../app').listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.getPool().end();
  if (createdDatabase) {
    assert.match(databaseName, /^ayk_test_finance_[a-f0-9]{20}$/);
    const admin = maintenance();
    await admin.connect();
    try { await admin.query(`DROP DATABASE "${databaseName}"`); }
    finally { await admin.end(); }
  }
});

test('no environment or provider name enables mock checkout or forged webhooks', async () => {
  const env = require('../config/env');
  for (const mode of ['production', 'test', 'development']) {
    for (const provider of ['', 'mock', 'stub', 'moyasar']) {
      env.NODE_ENV = mode; env.PAYMENT.PROVIDER = provider;
      assert.equal(paymentService.getAvailability().ready, false);
      assert.equal((await paymentService.createCheckoutSession({ amount: 1 })).ok, false);
      assert.equal((await paymentService.verifyWebhook({ tx: 'forged' })).ok, false);
    }
  }
  env.NODE_ENV = 'test'; env.PAYMENT.PROVIDER = '';
  const before = Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n);
  await api('/payments/session', { user: users.provider, method: 'POST', body: { amount: 0.01, subscription_id: 1 }, expected: 503 });
  await api('/payments/webhook', { method: 'POST', body: { tx: 'forged', status: 'completed' }, expected: 503 });
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n), before);
});

test('approved advertisements reject unpaid checkout with no payment or state change', async () => {
  const ad = await userAd();
  const before = Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n);
  const responses = await Promise.all(Array.from({ length: 8 }, () => api(`/ads/${ad.id}/pay`, { user: users.provider, method: 'POST', body: {}, expected: 503 })));
  assert.equal(responses.length, 8);
  assert.equal((await Ad.findById(ad.id)).status, 'approved');
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n), before);
  await api(`/ads/${ad.id}/pay`, { user: users.other, method: 'POST', body: {}, expected: 403 });
  await api(`/ads/${ad.id}/stats`, { user: users.other, expected: 403 });
  await api(`/ads/${ad.id}/stats`, { user: users.admin, expected: 403 });
  await api(`/ads/${ad.id}/stats`, { user: users.adsAdmin });
  await api(`/admin/ads/${ad.id}/activate`, { user: users.adsAdmin, method: 'POST', body: {}, expected: 409 });
});

test('ad activation requires matching verified payment and preserves schedule without expired renewals', async () => {
  const ad = await userAd(users.provider, { status: 'awaiting_payment', starts_at: new Date(Date.now() + 86400000) });
  assert.equal(await Ad.activate(ad.id), null);
  const foreign = await syntheticPayment(users.other, ad.amount, { metadata: { ad_id: ad.id } });
  assert.equal(await Ad.activate(ad.id, { paymentId: foreign.id }), null);
  const cheap = await syntheticPayment(users.provider, 0.01, { metadata: { ad_id: ad.id } });
  assert.equal(await Ad.activate(ad.id, { paymentId: cheap.id }), null);
  const wrongItem = await syntheticPayment(users.provider, ad.amount, { metadata: { ad_id: ad.id + 1 } });
  assert.equal(await Ad.activate(ad.id, { paymentId: wrongItem.id }), null);
  const stub = await syntheticPayment(users.provider, ad.amount, { provider: 'stub', metadata: { ad_id: ad.id } });
  assert.equal(await Ad.activate(ad.id, { paymentId: stub.id }), null);
  const verified = await syntheticPayment(users.provider, ad.amount, { metadata: { ad_id: ad.id } });
  const activated = await Ad.activate(ad.id, { paymentId: verified.id });
  assert.equal(activated.status, 'active');
  assert.equal(new Date(activated.ends_at) - new Date(activated.starts_at), 2 * 86400000);
  assert.equal(await Ad.activate(ad.id, { paymentId: verified.id }), null);
  await db.query("UPDATE ads SET status = 'expired', ends_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = ?", [ad.id]);
  assert.equal((await adService.activate({ adId: ad.id })).ok, false);
  assert.equal(await Ad.resume(ad.id), null);
});

test('unpaid user ads never serve and public ads omit private financial and moderation fields', async () => {
  const unpaid = await userAd(users.provider, { status: 'active', is_active: true, notes: 'private note' });
  const publicAd = await Ad.create({ title: 'Admin banner', image: 'https://example.invalid/banner.jpg', placement: 'home_top', status: 'active', is_active: true, notes: 'private note' });
  const rows = await api('/ads/live?placement=home_top');
  assert.ok(!rows.some(row => row.id === unpaid.id));
  const item = rows.find(row => row.id === publicAd.id);
  assert.ok(item);
  for (const field of ['notes', 'payment_id', 'paid_at', 'amount', 'user_id', 'rejection_reason', 'approved_by']) assert.equal(Object.hasOwn(item, field), false);
  assert.equal((await Ad.findById(unpaid.id)).status, 'expired');
});

test('concurrent view tracking enforces the purchased cap and writes matching daily statistics', async () => {
  const ad = await Ad.create({ title: 'Capped local banner', placement: 'sidebar', max_views: 3, status: 'active', is_active: true });
  const bumps = await Promise.all(Array.from({ length: 25 }, () => Ad.bumpViews(ad.id)));
  assert.equal(bumps.filter(Boolean).length, 3);
  assert.equal(Number((await Ad.findById(ad.id)).views_count), 3);
  assert.equal(Number((await db.queryOne('SELECT views_count FROM ad_stats_daily WHERE ad_id = ?', [ad.id])).views_count), 3);
  assert.equal(await Ad.bumpClicks(ad.id), null);
  const hidden = await userAd(users.provider, { status: 'requested' });
  assert.equal(await Ad.bumpViews(hidden.id), false);
  assert.equal(await Ad.bumpClicks(hidden.id), null);
  assert.equal(await Ad.bumpViews(2147483647), false);
  assert.equal(await db.queryOne('SELECT * FROM ad_stats_daily WHERE ad_id = ?', [hidden.id]), null);
  await api(`/ads/${hidden.id}/click`, { method: 'POST', expected: 404 });
});

test('ad quote and submission reject disabled placements, unsafe URLs, malformed dates and fractional limits', async () => {
  const body = { title: 'Local submitted ad', image: 'https://example.invalid/image.png', duration_days: 2, max_views: 500, placements: ['home_top'], exclusive: false };
  for (const bad of [
    { duration_days: 1.5 }, { max_views: 500.5 }, { placements: ['__proto__'] }, { placements: ['home_top', 'unknown'] },
    { placements: [] }, { exclusive: 'false' }, { starts_at: 'not-a-date' }, { link: 'javascript:alert(1)' },
    { image: 'data:image/svg+xml,bad' }, { title: {} }, { target_regions: [1.5] }, { target_countries: ['SA', {}] },
  ]) await api('/ads/request', { user: users.provider, method: 'POST', body: { ...body, ...bad }, expected: 400 });
  const config = await adService.getConfig();
  const single = adService.quote({ ...body, config });
  const duplicate = adService.quote({ ...body, placements: ['home_top', 'home_top'], config });
  assert.equal(duplicate.total, single.total);
  const saved = await api('/ads/request', { user: users.provider, method: 'POST', body: { ...body, amount: 0, status: 'active', is_active: true }, expected: 201 });
  assert.equal(saved.status, 'requested');
  assert.equal(Number(saved.amount), single.total);
  await Pricing.upsert({ placement: 'footer', price_per_day: 1, price_per_1k_views: 1, exclusive_multiplier: 2, is_active: false });
  await api('/ads/quote', { user: users.provider, method: 'POST', body: { ...body, placements: ['footer'] }, expected: 400 });
  await api('/ads/NaN/stats', { user: users.provider, expected: 400 });
  await api('/ads/live?placement[bad]=x', { expected: 400 });
});

test('pricing and billing validation reject negative, infinite, oversized and fractional-cent money atomically', async () => {
  for (const value of [-1, Infinity, NaN, 999999999, 1.001, '', null, true, {}]) assert.throws(() => Payment.money(value), /Invalid amount/);
  const before = await Pricing.findByPlacement('home_top');
  await assert.rejects(Pricing.bulkUpsert([
    { placement: 'home_top', price_per_day: 1, price_per_1k_views: 1, exclusive_multiplier: 2, is_active: true },
    { placement: 'home_hero', price_per_day: -1, price_per_1k_views: 1, exclusive_multiplier: 2, is_active: true },
  ]), /Invalid amount/);
  assert.equal((await Pricing.findByPlacement('home_top')).price_per_day, before.price_per_day);
  await assert.rejects(Payment.create({ user_id: users.provider.id, provider: 'local', amount: 10, currency: 'USD' }), /Invalid payment/);
  await api('/payments/my?limit=1000000000', { user: users.provider, expected: 400 });
  await api('/payments/my?page=-1', { user: users.provider, expected: 400 });
});

test('badge request races produce one application and no unpaid payment can activate it', async () => {
  const applicant = await makeUser();
  const results = await Promise.all(Array.from({ length: 20 }, () => badgeService.request({ user: applicant, badge_type: 'trusted' })));
  assert.equal(results.filter(result => result.ok).length, 1);
  const badge = results.find(result => result.ok).badge;
  await ProviderBadge.approve(badge.id, users.adsAdmin.id);
  const before = Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n);
  await api(`/badges/${badge.id}/pay`, { user: applicant, method: 'POST', body: {}, expected: 503 });
  await api(`/badges/${badge.id}/pay`, { user: users.other, method: 'POST', body: {}, expected: 403 });
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM payments')).n), before);
  assert.equal((await ProviderBadge.findById(badge.id)).status, 'approved');
  assert.equal(Number((await db.queryOne('SELECT badge_trusted_active FROM provider_profiles WHERE user_id = ?', [applicant.id])).badge_trusted_active), 0);
});

test('badge activation validates exact paid item, owner, amount and duration without replay extension', async () => {
  const applicant = await makeUser();
  const badge = await ProviderBadge.create({ user_id: applicant.id, badge_type: 'featured', monthly_fee: 99, insurance_amount: 20, insurance_required: true });
  await ProviderBadge.approve(badge.id, users.adsAdmin.id);
  await ProviderBadge.markAwaitingPayment(badge.id);
  for (const [user, amount, metadata, provider] of [[users.other, 119, { badge_id: badge.id }, 'verified_local_fixture'], [applicant, 99, { badge_id: badge.id }, 'verified_local_fixture'], [applicant, 119, { badge_id: badge.id + 1 }, 'verified_local_fixture'], [applicant, 119, { badge_id: badge.id }, 'stub']]) {
    const p = await syntheticPayment(user, amount, { metadata, provider });
    await assert.rejects(ProviderBadge.activate(badge.id, { paymentId: p.id, durationDays: 30 }), /Verified payment required/);
  }
  const p = await syntheticPayment(applicant, 119, { metadata: { badge_id: badge.id } });
  await assert.rejects(ProviderBadge.activate(badge.id, { paymentId: p.id, durationDays: -1 }), /Invalid badge duration/);
  const activated = await ProviderBadge.activate(badge.id, { paymentId: p.id, durationDays: 30 });
  assert.equal(activated.status, 'active');
  await assert.rejects(ProviderBadge.activate(badge.id, { paymentId: p.id, durationDays: 30 }), /Verified payment required/);
  assert.equal(new Date((await ProviderBadge.findById(badge.id)).ends_at).getTime(), new Date(activated.ends_at).getTime());
  assert.equal(Number((await db.queryOne('SELECT badge_featured_active FROM provider_profiles WHERE user_id = ?', [applicant.id])).badge_featured_active), 1);
});

test('legacy stub badge flags and unpaid active ads are revoked by sweeps', async () => {
  const applicant = await makeUser();
  const badge = await ProviderBadge.create({ user_id: applicant.id, badge_type: 'trusted', monthly_fee: 49 });
  const p = await syntheticPayment(applicant, 49, { provider: 'stub', metadata: { badge_id: badge.id } });
  await db.query("UPDATE provider_badges SET status = 'active', payment_id = ?, ends_at = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE id = ?", [p.id, badge.id]);
  await db.query("UPDATE provider_profiles SET badge_trusted_active = 1, badge_trusted_until = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE user_id = ?", [applicant.id]);
  await badgeService.sweep();
  assert.equal((await ProviderBadge.findById(badge.id)).status, 'expired');
  assert.equal(Number((await db.queryOne('SELECT badge_trusted_active FROM provider_profiles WHERE user_id = ?', [applicant.id])).badge_trusted_active), 0);
});

test('subscriptions use active authoritative plans and serialize duplicate applications', async () => {
  const applicant = await makeUser();
  const paidPlan = await plan({ price: 73 });
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => Subscription.createSubscription({ user_id: applicant.id, plan_id: paidPlan.id, amount: 0.01 })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const sub = results.find(result => result.status === 'fulfilled').value;
  assert.equal(Number(sub.amount), 73);
  await assert.rejects(Subscription.activateSubscription(sub.id), /Verified payment required/);
  await api('/subscriptions', { user: users.client, method: 'POST', body: { plan_id: paidPlan.id }, expected: 403 });
  const disabled = await plan({ active: false });
  await api('/subscriptions', { user: users.other, method: 'POST', body: { plan_id: disabled.id }, expected: 404 });
});

test('free subscription replay preserves dates and cancellation clears featured entitlement', async () => {
  const applicant = await makeUser();
  const freePlan = await plan({ price: 0, featured: true });
  const sub = await Subscription.createSubscription({ user_id: applicant.id, plan_id: freePlan.id });
  const active = await Subscription.activateSubscription(sub.id);
  const replay = await Subscription.activateSubscription(sub.id);
  assert.equal(new Date(replay.ends_at).getTime(), new Date(active.ends_at).getTime());
  assert.equal(Number((await db.queryOne('SELECT is_featured FROM provider_profiles WHERE user_id = ?', [applicant.id])).is_featured), 1);
  await assert.rejects(Subscription.cancel(sub.id, users.other.id), /Subscription not found/);
  await Subscription.cancel(sub.id, applicant.id);
  assert.equal(await Subscription.getActiveForUser(applicant.id), null);
  const profile = await db.queryOne('SELECT current_subscription_id, is_featured, featured_until FROM provider_profiles WHERE user_id = ?', [applicant.id]);
  assert.deepEqual(profile, { current_subscription_id: null, is_featured: 0, featured_until: null });
  await assert.rejects(Subscription.activateSubscription(sub.id), /Invalid subscription state/);
});

test('paid subscription activation rejects underpayment, foreign owner and mock provider', async () => {
  const applicant = await makeUser();
  const paidPlan = await plan({ price: 61 });
  const sub = await Subscription.createSubscription({ user_id: applicant.id, plan_id: paidPlan.id });
  for (const [user, amount, provider] of [[users.other, 61, 'verified_local_fixture'], [applicant, 0.01, 'verified_local_fixture'], [applicant, 61, 'mock']]) {
    const p = await syntheticPayment(user, amount, { provider, subscription_id: sub.id });
    await assert.rejects(Subscription.activateSubscription(sub.id, { paymentId: p.id }), /Verified payment required/);
  }
  const p = await syntheticPayment(applicant, 61, { subscription_id: sub.id });
  const active = await Subscription.activateSubscription(sub.id, { paymentId: p.id });
  assert.equal(active.payment_id, p.id);
  assert.equal((await Subscription.getActiveForUser(applicant.id)).id, sub.id);
  const replay = await Subscription.activateSubscription(sub.id, { paymentId: p.id });
  assert.equal(new Date(replay.ends_at).getTime(), new Date(active.ends_at).getTime());
});

test('authenticated settlement validates amount/currency, is idempotent, and rolls back failed entitlement activation', async () => {
  const applicant = await makeUser();
  const paidPlan = await plan({ price: 42 });
  const sub = await Subscription.createSubscription({ user_id: applicant.id, plan_id: paidPlan.id });
  const p = await Payment.create({ user_id: applicant.id, subscription_id: sub.id, provider: 'verified_local_fixture', amount: 42 });
  const tx = `local_settlement_${crypto.randomBytes(10).toString('hex')}`;
  await Payment.updateStatus(p.id, 'processing', tx);
  const verification = { authenticated: true, transaction_id: tx, provider: 'verified_local_fixture', currency: 'SAR', amount: 42, status: 'completed' };
  await assert.rejects(Payment.settleVerified({ ...verification, authenticated: false }), /Unverified payment/);
  await assert.rejects(Payment.settleVerified({ ...verification, amount: 0.01 }), /Payment mismatch/);
  await assert.rejects(Payment.settleVerified({ ...verification, currency: 'USD' }), /Unverified payment/);
  const first = await Payment.settleVerified(verification);
  assert.equal(first.changed, true);
  const before = await Subscription.getActiveForUser(applicant.id);
  assert.equal((await Payment.settleVerified(verification)).changed, false);
  assert.equal(new Date((await Subscription.getActiveForUser(applicant.id)).ends_at).getTime(), new Date(before.ends_at).getTime());
  await Payment.updateStatus(p.id, 'failed', tx);
  assert.equal((await Payment.findById(p.id)).status, 'completed');
  const secondApplicant = await makeUser();
  const secondSub = await Subscription.createSubscription({ user_id: secondApplicant.id, plan_id: paidPlan.id });
  const secondPayment = await Payment.create({ user_id: secondApplicant.id, subscription_id: secondSub.id, provider: 'verified_local_fixture', amount: 42 });
  const secondTx = `local_rollback_${crypto.randomBytes(10).toString('hex')}`;
  await Payment.updateStatus(secondPayment.id, 'processing', secondTx);
  await Subscription.cancel(secondSub.id, secondApplicant.id);
  await assert.rejects(Payment.settleVerified({ ...verification, transaction_id: secondTx }), /Invalid subscription state/);
  assert.equal((await Payment.findById(secondPayment.id)).status, 'processing');
  assert.equal((await Payment.findById(secondPayment.id)).paid_at, null);
});

test('state and SQL injection inputs cannot cross owners or reset workflow decisions', async () => {
  const ad = await userAd(users.provider, { status: 'requested' });
  await Ad.cancel(ad.id);
  assert.equal(await Ad.approve(ad.id, users.adsAdmin.id), null);
  assert.equal((await Ad.findById(ad.id)).status, 'cancelled');
  const rows = await Ad.listPaginated({ status: "active' OR 1=1 --" });
  assert.equal(rows.items.length, 0);
  await api('/ads/1%20OR%201=1/stats', { user: users.provider, expected: 400 });
  await api('/badges/Infinity/pay', { user: users.provider, method: 'POST', body: {}, expected: 400 });
  await api('/admin/ads', { user: users.admin, expected: 403 });
  await api('/badges/admin', { user: users.admin, expected: 403 });
});

test('targeted exclusive ads do not suppress matching shared ads when visitor geo is unavailable', async () => {
  const shared = await Ad.create({ title: 'Shared category placement', placement: 'search', status: 'active', is_active: true });
  const targeted = await Ad.create({ title: 'Targeted category exclusive', placement: 'search', status: 'active', is_active: true, exclusive: true, target_countries: ['SA'] });
  const geo = require('../services/ipGeoService');
  const original = geo.resolveVisitorGeo;
  geo.resolveVisitorGeo = async () => null;
  try {
    const rows = await api('/ads/live?placement=search');
    assert.ok(rows.some(row => row.id === shared.id));
    assert.ok(!rows.some(row => row.id === targeted.id));
  } finally { geo.resolveVisitorGeo = original; }
});
