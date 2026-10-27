// Fully isolated localhost integration coverage. Creates and drops only its own
// random database; never reads .env files or contacts external providers.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const databasePort = Number(process.env.RYZA_TEST_PORT || 55432);
assert.ok(Number.isSafeInteger(databasePort) && databasePort >= 1 && databasePort <= 65535, 'Local test database port must be valid');
const databaseName = `ryza_test_security_business_${crypto.randomBytes(10).toString('hex')}`;
const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ryza-security-business-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(databasePort), DB_NAME: databaseName,
  DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), AUTO_MIGRATE: 'false', VERCEL: '',
  APP_URL: 'http://127.0.0.1', CLIENT_URL: 'http://127.0.0.1', UPLOAD_DIR: uploadDirectory,
  MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_WEBHOOK_SECRET: '', PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '',
  API_RATE_LIMIT: '10000',
});
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const jwt = require('../utils/jwt');
const Request = require('../models/Request');
const Offer = require('../models/Offer');
const Subscription = require('../models/Subscription');
const Review = require('../models/Review');
const LocationShare = require('../models/LocationShare');
const Conversation = require('../models/Conversation');
const geo = require('../services/geoService');
let server, base, adminConnection, databaseCreated = false, cleanupPromise, startupPromise, interrupted = false;
function assertRunning() { if (interrupted) throw new Error('Business test interrupted'); }
const nativeFetch = global.fetch;
global.fetch = (...args) => {
  const destination = new URL(args[0]);
  assert.equal(destination.hostname, '127.0.0.1', 'Tests cannot contact any external host');
  assert.equal(destination.port, server ? String(server.address().port) : '', 'Tests cannot contact another application');
  return nativeFetch(...args);
};
async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    let failure;
    if (startupPromise) await startupPromise.catch(() => {});
    try { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } } catch (e) { failure = e; }
    try { await db.getPool().end(); } catch (e) { failure ||= e; }
    try {
      if (databaseCreated) {
        assert.match(databaseName, /^ryza_test_security_business_[a-f0-9]{20}$/);
        await adminConnection.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
        await adminConnection.query(`DROP DATABASE "${databaseName}"`);
        databaseCreated = false;
      }
    } catch (e) { failure ||= e; }
    try { if (adminConnection) await adminConnection.end(); } catch (e) { failure ||= e; }
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
    global.fetch = nativeFetch;
    if (failure) throw failure;
  })();
  return cleanupPromise;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; cleanup().then(() => process.exit(128), () => process.exit(1)); });
async function api(route, { user, body, method = 'GET', expected = 200 } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (expected !== null) assert.equal(response.status, expected, `${method} ${route}: ${result.message}`);
  return { ...result, statusCode: response.status };
}
async function account(role, permissions = [], superAdmin = false) {
  const inserted = await db.query(`INSERT INTO users (full_name, username, password_hash, role, is_super_admin, permissions)
    VALUES (?, ?, ?, ?, ?, ?)`, [`Local ${role}`, `test_${crypto.randomBytes(6).toString('hex')}`, 'unused-not-a-login-hash', role, Number(superAdmin), JSON.stringify(permissions)]);
  const id = inserted.insertId;
  if (role === 'provider') await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [id]);
  return { id, role, permissions, is_super_admin: Number(superAdmin), token: jwt.sign({ id, role, auth_version: 0 }) };
}
async function requestFor(client, data = {}) {
  return (await api('/requests', { method: 'POST', user: client, expected: 201,
    body: { title: 'طلب اختبار محلي', description: 'تفاصيل طلب اختباري محلي كامل', address: 'Private home address', latitude: 26.3261234, longitude: 43.9754321, ...data } })).data;
}
async function offerFor(provider, request, data = {}) {
  return (await api('/offers', { method: 'POST', user: provider, expected: 201,
    body: { request_id: request.id, price: '125.50', message: 'Private bid text', latitude: 26.3, longitude: 43.9, ...data } })).data;
}
async function localRequestFor(client) {
  const id = await Request.create({ client_id: client.id, title: 'Local quota fixture', description: 'Local quota security regression fixture' });
  return { id };
}
async function activeSubscriptionFor(provider, plan) {
  const subscription = await Subscription.createSubscription({ user_id: provider.id, plan_id: plan.id });
  let paymentId = null;
  if (Number(plan.price) > 0) {
    // Synthetic verified LOCAL payment fixture; no payment API/gateway call.
    const payment = await db.query(`INSERT INTO payments
      (user_id, subscription_id, provider, provider_transaction_id, amount, currency, status, paid_at)
      VALUES (?, ?, 'local_verified_fixture', ?, ?, 'SAR', 'completed', CURRENT_TIMESTAMP)`,
    [provider.id, subscription.id, `local_${crypto.randomBytes(10).toString('hex')}`, plan.price]);
    paymentId = payment.insertId;
  }
  return Subscription.activateSubscription(subscription.id, { paymentId });
}

// A single parent keeps dependent fixtures and database cleanup ordered.
test('business security: real PostgreSQL requests, offers, disputes, reviews and live location', { timeout: 120000 }, async t => {
  t.after(cleanup);
  startupPromise = (async () => {
    assertRunning();
    adminConnection = new Client({ host: '127.0.0.1', port: databasePort, user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 });
    await adminConnection.connect();
    assertRunning();
    await adminConnection.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    assertRunning();
    const installed = await require('../services/installService').setupFromEnv();
    assert.equal(installed.migrations.flatMap(m => m.errors).length, 0);
    assertRunning();
    server = require('../app').listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    assertRunning();
    base = `http://127.0.0.1:${server.address().port}/api`;
  })();
  await startupPromise;
  assertRunning();
  const client = await account('client'), otherClient = await account('client');
  const provider = await account('provider'), secondProvider = await account('provider'), reporter = await account('client');
  const restricted = await account('admin', ['dashboard.view']);
  const disputeOnly = await account('admin', ['disputes.manage']);
  const administrator = await account('admin', [], true);
  let job, accepted, conversationId, disputeId, reviewId;

  await t.test('public previews omit precise location, private attachments, and assignment; only owners receive private fields', async () => {
    job = await requestFor(client);
    const publicJob = (await api(`/requests/${job.id}`)).data;
    for (const field of ['latitude', 'longitude', 'address', 'files', 'assigned_provider_id', 'accepted_offer_id']) assert.equal(field in publicJob, false, field);
    const owned = (await api(`/requests/${job.id}`, { user: client })).data;
    assert.equal(owned.address, 'Private home address');
    assert.equal(Number(owned.latitude), 26.3261234);
    const nearby = (await api('/requests/nearby?latitude=26.3261234&longitude=43.9754321&radius=5')).data;
    assert.ok(nearby.some(r => r.id === job.id));
    for (const row of nearby) assert.equal('latitude' in row || 'address' in row || 'files' in row, false);
    await api('/requests/nearby?status=completed', { expected: 422 });
    for (const query of ['page=-1', 'limit=100001', 'latitude=NaN&longitude=1', 'latitude=1', 'radius=-1', 'latitude[]=1&longitude=1']) await api(`/requests/nearby?${query}`, { expected: 422 });
    await api(`/requests/${job.id}/chat`, { user: otherClient, method: 'POST', expected: 403 });
    await api('/requests', { user: provider, method: 'POST', body: { title: 'valid title', description: 'valid description' }, expected: 403 });
    for (const data of [{ budget_min: -1 }, { title: 'null\0title' }, { budget_min: 2, budget_max: 1 }, { budget_min: 1.123 }, { latitude: 91 }, { longitude: null }, { address: {} }, { service_id: 2147483647 }]) {
      await api('/requests', { user: client, method: 'POST', body: { title: 'valid title', description: 'valid description', latitude: 0, longitude: 0, ...data }, expected: 422 });
    }
    await assert.rejects(Request.create({ client_id: client.id, title: 'valid title', description: 'valid description', preferred_date: '2026-02-30' }), error => error.status === 422);
    await api(`/requests/${job.id}/status`, { user: client, method: 'PUT', body: { status: 'completed' }, expected: 409 });
    await api('/requests/not-an-id', { expected: 422 });
  });

  await t.test('public nearby radius queries cannot distinguish precise coordinates inside one coarse area', async () => {
    const coarseQuery = '/requests/nearby?latitude=26.33&longitude=43.98&radius=0.1';
    const preciseQuery = '/requests/nearby?latitude=26.3261234&longitude=43.9754321&radius=0.1';
    const before = (await api(coarseQuery)).data.find(row => row.id === job.id);
    assert.ok(before, 'Nearby results use the public approximate area');
    assert.ok(Number.isInteger(before.distance_km));
    assert.equal((await api(preciseQuery)).data.some(row => row.id === job.id), false, 'A small radius cannot reveal the private exact position');
    try {
      await db.query('UPDATE requests SET latitude = ?, longitude = ? WHERE id = ?', [26.3348, 43.9848, job.id]);
      const after = (await api(coarseQuery)).data.find(row => row.id === job.id);
      assert.ok(after);
      assert.equal(after.distance_km, before.distance_km);
      assert.equal((await api(preciseQuery)).data.some(row => row.id === job.id), false);
    } finally {
      await db.query('UPDATE requests SET latitude = ?, longitude = ? WHERE id = ?', [26.3261234, 43.9754321, job.id]);
    }
  });

  await t.test('private bids, money validation, duplicates, and concurrent acceptance preserve one assignment', async () => {
    for (const price of [-1, 0, 1.123, 100000000, 'NaN', 'Infinity', true, {}, []]) await api('/offers', { user: provider, method: 'POST', body: { request_id: job.id, price }, expected: 422 });
    await api('/offers', { user: provider, method: 'POST', body: { request_id: job.id, price: 10, latitude: 0 }, expected: 422 });
    const first = await offerFor(provider, job), second = await offerFor(secondProvider, job);
    await api('/offers', { user: provider, method: 'POST', body: { request_id: job.id, price: 10 }, expected: 409 });
    await db.query('UPDATE provider_profiles SET badge_trusted_active = 1, badge_featured_active = 1, is_featured = 1 WHERE user_id = ?', [provider.id]);
    const bids = (await api(`/offers/request/${job.id}`, { user: client })).data;
    assert.equal(bids.length, 2);
    const counterfeit = bids.find(b => b.provider_id === provider.id);
    assert.equal(counterfeit.badge_trusted_active, 0); assert.equal(counterfeit.badge_featured_active, 0); assert.equal(counterfeit.is_featured, 0);
    const ownedOffers = (await api(`/offers/request/${job.id}`, { user: provider })).data;
    assert.equal(ownedOffers.length, 1); assert.equal(ownedOffers[0].provider_id, provider.id);
    await api(`/offers/request/${job.id}`, { user: otherClient, expected: 403 });
    await api(`/offers/request/${job.id}`, { user: restricted, expected: 403 });
    await api(`/offers/${first.id}/accept`, { user: otherClient, method: 'PUT', expected: 403 });
    const results = await Promise.all([first, second].map(offer => api(`/offers/${offer.id}/accept`, { user: client, method: 'PUT', expected: null })));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const rows = await db.query('SELECT id, provider_id, status FROM offers WHERE request_id = ?', [job.id]);
    assert.equal(rows.filter(r => r.status === 'accepted').length, 1);
    accepted = rows.find(r => r.status === 'accepted');
    const assigned = (await api(`/requests/${job.id}`, { user: client })).data;
    assert.equal(assigned.accepted_offer_id, accepted.id); assert.equal(assigned.assigned_provider_id, accepted.provider_id);
    await api(`/offers/${accepted.id}/reject`, { user: client, method: 'PUT', expected: 409 });
    await api(`/requests/${job.id}`, { expected: 404 });
    await api(`/requests/${job.id}`, { user: otherClient, expected: 404 });
    await api(`/requests/${job.id}`, { user: restricted, expected: 404 });
    await api(`/requests/${job.id}`, { user: administrator });
    await api(`/requests/${job.id}/tracking`, { user: otherClient, expected: 404 }); // Only /tracking/requests is mounted.
    await api(`/tracking/requests/${job.id}`, { user: otherClient, expected: 403 });
    await api(`/requests/${job.id}`, { user: client, method: 'DELETE', expected: 409 });
    const worker = accepted.provider_id === provider.id ? provider : secondProvider;
    conversationId = (await api(`/requests/${job.id}/chat`, { user: worker, method: 'POST' })).data.conversation_id;
    await api('/chat/conversations', { user: otherClient, method: 'POST', body: { request_id: job.id, user_id: client.id }, expected: 403 });
    await api(`/requests/${job.id}/status`, { user: worker, method: 'PUT', body: { status: 'cancelled' }, expected: 403 });
    await api(`/requests/${job.id}/status`, { user: otherClient, method: 'PUT', body: { status: 'completed' }, expected: 403 });
  });

  await t.test('disputes are party scoped, grant-reason audited, and frozen/resolved workflow is atomic', async () => {
    disputeId = (await api('/disputes', { user: client, method: 'POST', body: { request_id: job.id, subject: 'نزاع الاختبار', description: 'وصف خاص للنزاع' }, expected: 201 })).data.id;
    const worker = accepted.provider_id === provider.id ? provider : secondProvider;
    await api('/disputes', { user: worker, method: 'POST', body: { request_id: job.id, subject: 'Another dispute' }, expected: 409 });
    await api(`/disputes/${disputeId}`, { user: worker });
    assert.ok((await api('/disputes', { user: worker })).data.some(d => d.id === disputeId));
    await api(`/disputes/${disputeId}/timeline`, { user: otherClient, expected: 403 });
    await api(`/disputes/${disputeId}/conversation`, { user: administrator, expected: 403 });
    await api(`/disputes/${disputeId}/access`, { user: restricted, method: 'POST', body: { reason: 'investigate' }, expected: 403 });
    await api(`/disputes/${disputeId}/access`, { user: disputeOnly, method: 'POST', body: { reason: 'investigate' }, expected: 403 });
    await api(`/disputes/${disputeId}/access`, { user: administrator, method: 'POST', body: { reason: {} }, expected: 422 });
    await api(`/disputes/${disputeId}/access`, { user: administrator, method: 'POST', body: { reason: 'Local investigation reason' } });
    await api(`/disputes/${disputeId}/conversation`, { user: administrator });
    await api(`/disputes/${disputeId}/messages`, { user: administrator, method: 'POST', body: { body: 'Internal note', internal: true }, expected: 201 });
    assert.equal((await api(`/disputes/${disputeId}/timeline`, { user: client })).data.messages.length, 0);
    assert.equal((await api(`/disputes/${disputeId}/timeline`, { user: administrator })).data.messages.length, 1);
    await api(`/disputes/${disputeId}/status`, { user: administrator, method: 'PUT', body: { status: 'under_review', frozen: 'false' }, expected: 422 });
    await api(`/disputes/${disputeId}/status`, { user: administrator, method: 'PUT', body: { status: 'escalated', frozen: true } });
    await api(`/requests/${job.id}/status`, { user: client, method: 'PUT', body: { status: 'completed' }, expected: 409 });
    await api(`/disputes/${disputeId}/resolve`, { user: administrator, method: 'PUT', body: { resolution: 'Local decision'.repeat(50), ratings_allowed: 'both' } });
    const timeline = (await api(`/disputes/${disputeId}/timeline`, { user: client })).data;
    assert.equal(timeline.dispute.resolution, 'Local decision'.repeat(50));
    assert.equal(timeline.dispute.ratings_allowed, 'both');
    assert.ok(timeline.statusLogs.some(log => log.from_status === 'escalated' && log.to_status === 'resolved'));
    await api(`/disputes/${disputeId}/status`, { user: administrator, method: 'PUT', body: { status: 'open' }, expected: 409 });
    await api(`/disputes/${disputeId}/conversation`, { user: administrator, expected: 403 });
    await api(`/disputes/${disputeId}/messages`, { user: client, method: 'POST', body: { body: 'Cannot reopen via message' }, expected: 409 });
    await api(`/requests/${job.id}/status`, { user: worker, method: 'PUT', body: { status: 'in_progress' } });
    await api(`/requests/${job.id}/status`, { user: client, method: 'PUT', body: { status: 'completed' } });
    await api(`/requests/${job.id}/status`, { user: client, method: 'PUT', body: { status: 'completed' }, expected: 409 });
    assert.equal(Number((await db.queryOne('SELECT completed_orders FROM provider_profiles WHERE user_id = ?', [accepted.provider_id])).completed_orders), 1);
    const restriction = (await api('/disputes', { user: worker, method: 'POST', body: { request_id: job.id, subject: 'Second case after completion' }, expected: 201 })).data;
    await assert.rejects(Review.create({ request_id: job.id, reviewer_id: client.id, rating: 5 }), error => error.status === 403);
    await api(`/disputes/${restriction.id}/resolve`, { user: administrator, method: 'PUT', body: { resolution: 'Client rating only', ratings_allowed: 'client_only' } });
    await assert.rejects(Review.create({ request_id: job.id, reviewer_id: worker.id, rating: 5 }), error => error.status === 403);
    await api(`/disputes/${restriction.id}/resolve`, { user: administrator, method: 'PUT', body: { resolution: 'Both parties may rate', ratings_allowed: 'both' } });

  });

  await t.test('review ratings and criteria are bounded; races and repeated reports cannot corrupt moderation or counters', async () => {
    for (const rating of [0, 6, -1, 1.5, {}, [], true, 'NaN']) await api('/reviews', { user: client, method: 'POST', body: { request_id: job.id, rating }, expected: 422 });
    for (const data of [{ request_id: true }, { request_id: [job.id] }, { original_language: ['ar'] }, { comment: 'null\0comment' }]) await api('/reviews', { user: client, method: 'POST', body: { request_id: job.id, rating: 5, ...data }, expected: 422 });
    await api('/reviews', { user: otherClient, method: 'POST', body: { request_id: job.id, rating: 5 }, expected: 403 });
    await api('/reviews', { user: client, method: 'POST', body: { request_id: job.id, rating: 5, criteria_ratings: '{bad' }, expected: 422 });
    await api('/reviews', { user: client, method: 'POST', body: { request_id: job.id, rating: 5, criteria_ratings: { quality: 9 } }, expected: 422 });
    const reviews = await Promise.all([1, 2].map(() => api('/reviews', { user: client, method: 'POST', body: { request_id: job.id, rating: 5, comment: 'تقييم محلي', original_language: 'ar', criteria_ratings: { quality: 5 } }, expected: null })));
    assert.equal(reviews.filter(r => r.statusCode === 201).length, 1);
    assert.ok(reviews.some(r => [400, 409].includes(r.statusCode)));
    reviewId = reviews.find(r => r.statusCode === 201).data.id;
    const before = await db.queryOne('SELECT completed_orders, rating_count FROM provider_profiles WHERE user_id = ?', [accepted.provider_id]);
    assert.equal(Number(before.completed_orders), 1); assert.equal(Number(before.rating_count), 1);
    const toggles = await Promise.all([1, 2].map(() => api(`/reviews/${reviewId}/helpful`, { user: otherClient, method: 'POST' })));
    assert.deepEqual(toggles.map(r => r.data.voted).sort(), [false, true]);
    assert.equal(Number((await db.queryOne('SELECT helpful_count FROM reviews WHERE id = ?', [reviewId])).helpful_count), 0);
    const reports = await Promise.all([1, 2].map(() => api(`/reviews/${reviewId}/report`, { user: otherClient, method: 'POST', body: { reason: 'fake' }, expected: null })));
    assert.deepEqual(reports.map(r => r.statusCode).sort(), [200, 409]);
    assert.equal(Number((await db.queryOne('SELECT report_count FROM reviews WHERE id = ?', [reviewId])).report_count), 1);
    await api(`/reviews/${reviewId}/report`, { user: reporter, method: 'POST', body: { reason: 'spam' } });
    await api(`/reviews/${reviewId}/report`, { user: provider, method: 'POST', body: { reason: 'other' } });
    assert.equal((await db.queryOne('SELECT is_visible FROM reviews WHERE id = ?', [reviewId])).is_visible, 0);
    await api(`/reviews/${reviewId}/translation?lang=ar`, { expected: 404 });
    await api(`/reviews/${reviewId}/helpful`, { user: client, method: 'POST', expected: 404 });
    assert.equal(Number((await db.queryOne('SELECT rating_count FROM provider_profiles WHERE user_id = ?', [accepted.provider_id])).rating_count), 0);
    await Review.setVisibility(reviewId, true);
    await api(`/reviews/${reviewId}/translation?lang=ar`);
    await api(`/reviews/${reviewId}/translation?lang[]=ar`, { expected: 422 });
    await db.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [accepted.provider_id]);
    await api(`/reviews/${reviewId}/translation?lang=ar`, { expected: 404 });
    assert.equal((await api(`/reviews/user/${accepted.provider_id}`)).data.length, 0);
    assert.equal((await api(`/reviews/user/${accepted.provider_id}/stats`)).data.rating_count, 0);
    await db.query('UPDATE users SET deleted_at = NULL WHERE id = ?', [accepted.provider_id]);
    await Review.adminDelete(reviewId);
    assert.equal(Number((await db.queryOne('SELECT rating_count FROM provider_profiles WHERE user_id = ?', [accepted.provider_id])).rating_count), 0);
  });

  await t.test('location input, zero metadata, TTL expiry, stop-sharing and participant checks preserve privacy', async () => {
    const route = `/chat/conversations/${conversationId}/location`;
    const worker = accepted.provider_id === provider.id ? provider : secondProvider;
    await api(route, { user: otherClient, method: 'POST', body: { latitude: 0, longitude: 0 }, expected: 403 });
    for (const data of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: [] }, { latitude: 0, longitude: 0, speed_kmh: -1 }, { latitude: 0, longitude: 0, heading: 360 }, { latitude: 0, longitude: 0, is_live: 'false' }]) await api(route, { user: worker, method: 'POST', body: data, expected: 422 });
    await db.query("UPDATE settings SET setting_value = 'Infinity' WHERE setting_key = 'location_share_ttl_minutes'");
    const location = (await api(route, { user: worker, method: 'POST', body: { latitude: 0, longitude: 0, accuracy_m: 0, speed_kmh: 0, heading: 0 } })).data;
    assert.equal(Number(location.latitude), 0); assert.equal(Number(location.accuracy_m), 0);
    assert.ok(Number.isFinite(new Date(location.expires_at).getTime()));
    assert.equal((await api(route + '/latest', { user: client })).data.length, 1);
    await api(route, { user: worker, method: 'POST', body: { latitude: 0, longitude: 0, is_live: false } });
    assert.equal((await api(route + '/latest', { user: client })).data.length, 0);
    await assert.rejects(LocationShare.create({ conversation_id: conversationId, user_id: worker.id, sender_role: 'provider', latitude: 0, longitude: 0, ttl_minutes: -1 }), error => error.status === 422);
    await api(route, { user: worker, method: 'DELETE' });
    assert.equal((await api(route + '/latest', { user: client })).data.length, 0);
    await db.query('UPDATE location_shares SET is_live = 1, expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE id = ?', [location.id]);
    assert.deepEqual(await LocationShare.getLatestForConversation(conversationId), []);
    assert.equal(geo.isValidLatLng(Infinity, 0), false);
    assert.equal(geo.distanceKm(0, 0, 0, 180) > 20000, true);
    assert.equal(geo.distanceKm(91, 0, 0, 0), null);
  });

  await t.test('cancellation and deletion race with new bids without orphan pending offers', async () => {
    const cancelled = await requestFor(client, { latitude: 0, longitude: 0 });
    const races = await Promise.all([
      api('/offers', { user: provider, method: 'POST', body: { request_id: cancelled.id, price: 10 }, expected: null }),
      api(`/requests/${cancelled.id}/status`, { user: client, method: 'PUT', body: { status: 'cancelled' }, expected: null }),
    ]);
    assert.equal(races[1].statusCode, 200);
    assert.ok([201, 409].includes(races[0].statusCode));
    assert.equal(Number((await db.queryOne("SELECT COUNT(*) AS count FROM offers WHERE request_id = ? AND status = 'pending'", [cancelled.id])).count), 0);
    await api(`/requests/${cancelled.id}/status`, { user: client, method: 'PUT', body: { status: 'completed' }, expected: 409 });
    const deleted = await requestFor(client, { latitude: 0, longitude: 0 });
    const deletions = await Promise.all([
      api('/offers', { user: secondProvider, method: 'POST', body: { request_id: deleted.id, price: 10 }, expected: null }),
      api(`/requests/${deleted.id}`, { user: client, method: 'DELETE', expected: null }),
    ]);
    assert.equal(deletions[1].statusCode, 200); assert.ok([201, 404].includes(deletions[0].statusCode));
    assert.equal(Number((await db.queryOne("SELECT COUNT(*) AS count FROM offers WHERE request_id = ? AND status = 'pending'", [deleted.id])).count), 0);
    await api(`/requests/${deleted.id}`, { user: client, expected: 404 });
    assert.equal((await Offer.findByProvider(secondProvider.id)).items.some(o => o.request_id === deleted.id), false);
  });

  await t.test('authoritative monthly quota serializes different requests and counts all current UTC month submissions', async () => {
    const limitedProvider = await account('provider');
    const plan = await Subscription.createPlan({ name_ar: 'Local monthly limit', slug: `local_limit_${crypto.randomBytes(6).toString('hex')}`, price: 40, max_offers_per_month: 1 });
    await activeSubscriptionFor(limitedProvider, plan);
    const previousJob = await localRequestFor(client), futureJob = await localRequestFor(client);
    const previousOffer = await offerFor(limitedProvider, previousJob);
    await db.query("UPDATE offers SET status = 'withdrawn', created_at = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 second' WHERE id = ?", [previousOffer.id]);
    const futureOffer = await offerFor(limitedProvider, futureJob);
    await db.query("UPDATE offers SET created_at = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month' WHERE id = ?", [futureOffer.id]);
    const jobs = await Promise.all([localRequestFor(client), localRequestFor(client)]);
    const results = await Promise.all(jobs.map(request => api('/offers', { user: limitedProvider, method: 'POST', body: { request_id: request.id, price: 10 }, expected: null })));
    assert.deepEqual(results.map(result => result.statusCode).sort(), [201, 409]);
    const submitted = results.find(result => result.statusCode === 201).data;
    await db.query("UPDATE offers SET status = 'rejected' WHERE id = ?", [submitted.id]);
    const forgedPlan = await Subscription.createPlan({ name_ar: 'Local forged unlimited', slug: `local_forged_${crypto.randomBytes(6).toString('hex')}`, price: 40, max_offers_per_month: null });
    const forged = await db.query(`INSERT INTO subscriptions (user_id, plan_id, status, amount, starts_at, ends_at)
      VALUES (?, ?, 'active', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`, [limitedProvider.id, forgedPlan.id]);
    await db.query('UPDATE provider_profiles SET current_subscription_id = ?, is_featured = 1 WHERE user_id = ?', [forged.insertId, limitedProvider.id]);
    await api('/offers', { user: limitedProvider, method: 'POST', body: { request_id: (await localRequestFor(client)).id, price: 10 }, expected: 409 });
    const count = await db.queryOne(`SELECT COUNT(*) AS count FROM offers WHERE provider_id = ?
      AND created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND created_at < date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month'`, [limitedProvider.id]);
    assert.equal(Number(count.count), 1);
  });

  await t.test('zero means no offers, null remains unlimited, and invalid or expired subscriptions impose no plan quota', async () => {
    const zeroProvider = await account('provider');
    const zeroPlan = await Subscription.createPlan({ name_ar: 'Local zero limit', slug: `local_zero_${crypto.randomBytes(6).toString('hex')}`, price: 0, max_offers_per_month: 0 });
    assert.equal(zeroPlan.max_offers_per_month, 0, 'Creating a plan must preserve its explicit zero limit');
    const zeroSubscription = await activeSubscriptionFor(zeroProvider, zeroPlan);
    const zeroJob = await localRequestFor(client);
    await api('/offers', { user: zeroProvider, method: 'POST', body: { request_id: zeroJob.id, price: 10 }, expected: 409 });
    await db.query("UPDATE subscriptions SET ends_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = ?", [zeroSubscription.id]);
    await offerFor(zeroProvider, zeroJob);

    const unlimitedProvider = await account('provider');
    const launchPlan = await Subscription.findPlanById(2);
    assert.equal(Number(launchPlan.price), 40); assert.equal(launchPlan.max_offers_per_month, null);
    await activeSubscriptionFor(unlimitedProvider, launchPlan);
    await offerFor(unlimitedProvider, await localRequestFor(client));
    await offerFor(unlimitedProvider, await localRequestFor(client));

    const forgedProvider = await account('provider');
    const paidZeroPlan = await Subscription.createPlan({ name_ar: 'Local unverified zero', slug: `local_paid_zero_${crypto.randomBytes(6).toString('hex')}`, price: 40, max_offers_per_month: 0 });
    const forged = await db.query(`INSERT INTO subscriptions (user_id, plan_id, status, amount, starts_at, ends_at)
      VALUES (?, ?, 'active', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`, [forgedProvider.id, paidZeroPlan.id]);
    await db.query('UPDATE provider_profiles SET current_subscription_id = ?, is_featured = 1 WHERE user_id = ?', [forged.insertId, forgedProvider.id]);
    await offerFor(forgedProvider, await localRequestFor(client));
    await offerFor(forgedProvider, await localRequestFor(client));
  });

  await t.test('configured per-request cap serializes different providers and does not refill after rejection', async () => {
    const original = await db.queryOne("SELECT setting_value FROM settings WHERE setting_key = 'max_offers_per_request'");
    const cappedJob = await localRequestFor(client);
    const bidders = await Promise.all([account('provider'), account('provider')]);
    try {
      await db.query("UPDATE settings SET setting_value = '1' WHERE setting_key = 'max_offers_per_request'");
      const results = await Promise.all(bidders.map(user => api('/offers', { user, method: 'POST', body: { request_id: cappedJob.id, price: 10 }, expected: null })));
      assert.deepEqual(results.map(result => result.statusCode).sort(), [201, 409]);
      await db.query("UPDATE offers SET status = 'rejected' WHERE request_id = ?", [cappedJob.id]);
      await api('/offers', { user: await account('provider'), method: 'POST', body: { request_id: cappedJob.id, price: 10 }, expected: 409 });
      assert.equal(Number((await db.queryOne('SELECT offers_count FROM requests WHERE id = ?', [cappedJob.id])).offers_count), 1);
    } finally {
      await db.query("UPDATE settings SET setting_value = ? WHERE setting_key = 'max_offers_per_request'", [original.setting_value]);
    }
  });
});
