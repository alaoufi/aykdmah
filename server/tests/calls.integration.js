// Calls: permissions, lifecycle, token scope and abuse controls. LiveKit itself is not
// contacted (no LIVEKIT_API_URL); tokens are verified by decoding them locally.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.AYK_CALLS_TEST_DB;

if (!databasePrefix) {
  test('calls integration (set AYK_CALLS_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_calls[a-z0-9_]{0,20}$/.test(databasePrefix)) throw new Error('Use a disposable ayk_test_calls* database prefix.');
  function vapid() {
    const k = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = k.publicKey.export({ format: 'jwk' });
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
    return { PUSH_PUBLIC_KEY: point.toString('base64url'), PUSH_PRIVATE_KEY: k.privateKey.export({ format: 'jwk' }).d, PUSH_SUBJECT: 'https://aykdmh.test' };
  }
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  const livekitSecret = crypto.randomBytes(32).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    LIVEKIT_URL: 'wss://calls.test.invalid/livekit', LIVEKIT_API_URL: '',
    LIVEKIT_API_KEY: 'testkey', LIVEKIT_API_SECRET: livekitSecret,
    ...vapid(),
  });
  // Push deliveries are recorded instead of sent to a real push service.
  const pushes = [];
  require('web-push').sendNotification = async (subscription, body, options) => {
    pushes.push({ endpoint: subscription.endpoint, body: JSON.parse(body), options });
    if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  };
  const { Client } = require('pg');
  const db = require('../config/database');
  const jwt = require('../utils/jwt');
  const Conversation = require('../models/Conversation');
  const calls = require('../services/callService');
  let server, base, createdDatabase = false;
  const users = {};
  let conversation, closedConversation, requestId;

  const admin = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  async function api(route, { user, method = 'GET', body } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const endAll = () => db.query("UPDATE calls SET status = 'ended' WHERE status IN ('ringing', 'accepted')");

  test.before(async () => {
    const client = admin();
    await client.connect();
    try { await client.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await client.end(); }
    const setup = await require('../services/installService').setupFromEnv();
    assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
    for (const [name, role] of [['client', 'client'], ['provider', 'provider'], ['outsider', 'client'], ['bidder', 'provider']]) {
      const row = await db.query('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, `${name}@test.invalid`, 'unused-local-test-hash', role]);
      users[name] = { id: row.insertId, role, token: jwt.sign({ id: row.insertId, role, auth_version: 0 }) };
    }
    const r = await db.query("INSERT INTO requests (client_id, title, description, assigned_provider_id, status) VALUES (?, ?, ?, ?, 'assigned')",
      [users.client.id, 'Local call audit', 'Local private request', users.provider.id]);
    requestId = r.insertId;
    conversation = await Conversation.findOrCreateBetween(users.client.id, users.provider.id, requestId);
    // A bidder whose offer is no longer pending keeps read-only history but may not call.
    const open = await db.query("INSERT INTO requests (client_id, title, description, status) VALUES (?, ?, ?, 'open')",
      [users.client.id, 'Closed negotiation', 'Local private request']);
    await db.query("INSERT INTO offers (request_id, provider_id, price, message, status) VALUES (?, ?, 10, 'offer', 'pending')", [open.insertId, users.bidder.id]);
    closedConversation = await Conversation.findOrCreateBetween(users.client.id, users.bidder.id, open.insertId);
    await db.query("UPDATE offers SET status = 'rejected' WHERE request_id = ?", [open.insertId]);
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

  test('a call between the request parties rings, connects, and ends with a duration', async () => {
    const started = await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'video' } });
    assert.equal(started.status, 200, started.body?.message);
    const call = started.body.data;
    assert.equal(call.status, 'ringing');
    // No site open and no notifications for the provider in this test: the caller is told (AYK-056).
    assert.equal(call.callee_reachable, false);
    assert.equal(call.request_id, requestId);
    assert.equal(call.peer.id, users.provider.id);
    assert.equal(call.peer.phone, undefined, 'no phone numbers in call payloads');

    const incoming = await api('/calls/active', { user: users.provider });
    assert.equal(incoming.body.data[0].direction, 'incoming');
    // The callee gets no token before answering; the caller may prepare media.
    assert.equal((await api(`/calls/${call.id}/token`, { user: users.provider, method: 'POST' })).status, 409);
    const callerToken = await api(`/calls/${call.id}/token`, { user: users.client, method: 'POST' });
    assert.equal(callerToken.status, 200);

    const accepted = await api(`/calls/${call.id}/accept`, { user: users.provider, method: 'POST' });
    assert.equal(accepted.body.data.status, 'accepted');
    const token = await api(`/calls/${call.id}/token`, { user: users.provider, method: 'POST' });
    assert.equal(token.status, 200);
    const claims = decode(token.body.data.token);
    assert.equal(claims.video.room, token.body.data.room);
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.canPublishData, false);
    assert.ok(!claims.video.roomAdmin && !claims.video.roomRecord, 'no admin or recording grants');
    assert.deepEqual(claims.video.canPublishSources, ['microphone', 'camera']);
    const issued = claims.iat ?? claims.nbf;
    assert.ok(Number.isFinite(claims.exp) && Number.isFinite(issued), 'token has an expiry');
    assert.ok(claims.exp - issued <= 15 * 60, 'token lives at most 15 minutes');
    assert.equal(claims.sub, `user-${users.provider.id}`);
    assert.ok(!JSON.stringify(token.body.data).includes(process.env.LIVEKIT_API_SECRET), 'secret never leaves the server');

    await db.query('UPDATE calls SET answered_at = answered_at - INTERVAL \'65 seconds\' WHERE id = ?', [call.id]);
    const ended = await api(`/calls/${call.id}/decline`, { user: users.client, method: 'POST' });
    assert.equal(ended.body.data.status, 'ended');
    assert.equal(ended.body.data.end_reason, 'caller_hangup');
    assert.ok(ended.body.data.duration_seconds >= 65);
    // After the end nobody can get a token for that room again.
    assert.equal((await api(`/calls/${call.id}/token`, { user: users.provider, method: 'POST' })).status, 409);
    const history = await api(`/calls/history?request_id=${requestId}`, { user: users.provider });
    assert.equal(history.body.data[0].id, call.id);
  });

  test('a third user cannot start, see, answer, join or end someone else\'s call', async () => {
    await endAll();
    assert.equal((await api('/calls', { user: users.outsider, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).status, 403);
    const call = (await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).body.data;
    for (const action of ['accept', 'decline', 'token', 'report']) {
      const res = await api(`/calls/${call.id}/${action}`, { user: users.outsider, method: 'POST', body: { reason: 'abuse test' } });
      assert.equal(res.status, 404, `${action} must not reveal or touch the call`);
    }
    assert.deepEqual((await api('/calls/active', { user: users.outsider })).body.data, []);
    assert.deepEqual((await api('/calls/history', { user: users.outsider })).body.data, []);
    // The caller cannot answer their own call; only the callee can.
    assert.equal((await api(`/calls/${call.id}/accept`, { user: users.client, method: 'POST' })).status, 403);
    // Knowing the room name is useless: tokens are minted per call and per participant only.
    const room = (await db.queryOne('SELECT room_name FROM calls WHERE id = ?', [call.id])).room_name;
    assert.match(room, /^call_[0-9a-f]{32}$/);
    assert.equal((await api('/calls/eligibility/' + users.client.id, { user: users.outsider })).body.data.allowed, false);
    assert.equal((await api(`/calls/${call.id}/decline`, { user: users.provider, method: 'POST' })).body.data.status, 'rejected');
  });

  test('closed negotiations, blocked accounts and busy lines are refused', async () => {
    await endAll();
    assert.equal((await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: closedConversation, call_type: 'audio' } })).status, 403);
    assert.equal((await api('/calls', { user: users.bidder, method: 'POST', body: { conversation_id: closedConversation, call_type: 'audio' } })).status, 403);
    assert.equal((await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'screen' } })).status, 400);

    const first = await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } });
    assert.equal(first.status, 200);
    const busy = await api('/calls', { user: users.provider, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } });
    assert.equal(busy.status, 409);
    await api(`/calls/${first.body.data.id}/decline`, { user: users.client, method: 'POST' });

    // Calling the same person again after a few seconds replaces the earlier try (AYK-058).
    const earlier = (await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).body.data;
    await db.query("UPDATE calls SET created_at = created_at - INTERVAL '10 seconds' WHERE id = ?", [earlier.id]);
    const again = await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } });
    assert.equal(again.status, 200);
    const replaced = await db.queryOne('SELECT status, end_reason FROM calls WHERE id = ?', [earlier.id]);
    assert.deepEqual([replaced.status, replaced.end_reason], ['cancelled', 'replaced']);
    await api(`/calls/${again.body.data.id}/decline`, { user: users.client, method: 'POST' });

    await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [users.provider.id]);
    try {
      assert.equal((await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).status, 403);
    } finally { await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [users.provider.id]); }
  });

  test('concurrent starts create only one active call', async () => {
    await endAll();
    const results = await Promise.all([users.client, users.provider, users.client, users.provider].map(user =>
      api('/calls', { user, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(Number((await db.queryOne("SELECT COUNT(*) AS n FROM calls WHERE status IN ('ringing','accepted')")).n), 1);
  });

  test('unanswered calls become missed and notify the callee', async () => {
    await endAll();
    const call = (await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).body.data;
    await db.query("UPDATE calls SET created_at = created_at - INTERVAL '2 minutes' WHERE id = ?", [call.id]);
    await calls.sweep();
    const row = await db.queryOne('SELECT status, end_reason FROM calls WHERE id = ?', [call.id]);
    assert.deepEqual({ ...row }, { status: 'missed', end_reason: 'no_answer' });
    await new Promise(resolve => setTimeout(resolve, 100));
    const note = await db.queryOne("SELECT link FROM notifications WHERE user_id = ? AND type = 'missed_call' ORDER BY id DESC", [users.provider.id]);
    assert.equal(note?.link, `/chat/${conversation}`);
  });

  test('eligibility finds the shared request conversation', async () => {
    const result = await api(`/calls/eligibility/${users.provider.id}`, { user: users.client });
    assert.deepEqual(result.body.data, { allowed: true, conversation_id: conversation, configured: true });
    assert.equal((await api(`/calls/eligibility/${users.bidder.id}`, { user: users.client })).body.data.allowed, false);
  });

  test('abuse reports are stored once per participant and visible to admins only', async () => {
    const row = await db.queryOne('SELECT id FROM calls ORDER BY id LIMIT 1');
    assert.equal((await api(`/calls/${row.id}/report`, { user: users.provider, method: 'POST', body: { reason: 'x' } })).status, 400);
    assert.equal((await api(`/calls/${row.id}/report`, { user: users.provider, method: 'POST', body: { reason: 'Rude behaviour' } })).status, 200);
    await api(`/calls/${row.id}/report`, { user: users.provider, method: 'POST', body: { reason: 'Again' } });
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM call_reports')).n), 1);
    assert.equal((await api('/calls/admin/stats', { user: users.client })).status, 403);
    const stats = await calls.stats({ days: 30 });
    assert.ok(stats.totals.total >= 5);
    assert.equal(stats.reports.length, 1);
    // Live load for the admin calls page (AYK-050).
    assert.equal(typeof stats.live.now.total, 'number');
    assert.ok(stats.live.today.total >= 1);
    assert.ok(stats.live.capacity.video > 0 && stats.live.capacity.used_percent >= 0 && stats.live.capacity.used_percent <= 100);
    const at = minutes => new Date(Date.UTC(2026, 0, 1, 10, minutes));
    assert.equal(calls.peakConcurrent([
      { answered_at: at(0), ended_at: at(10) }, { answered_at: at(5), ended_at: at(15) },
      { answered_at: at(10), ended_at: at(20) }, { answered_at: at(30), ended_at: null },
    ], at(40).getTime()), 2);
  });

  test('an incoming call rings the callee devices through Web Push, and only valid subscriptions are kept', async () => {
    await endAll();
    const key = await api('/push/key');
    assert.equal(key.body.data.key, process.env.PUSH_PUBLIC_KEY);
    const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
    const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys };
    assert.equal((await api('/push/subscribe', { method: 'POST', body: { subscription: device } })).status, 401);
    for (const bad of [{ ...device, endpoint: 'https://evil.example/push' }, { ...device, endpoint: 'http://fcm.googleapis.com/x' }, { endpoint: device.endpoint, keys: {} }]) {
      assert.equal((await api('/push/subscribe', { user: users.provider, method: 'POST', body: { subscription: bad } })).status, 400);
    }
    assert.equal((await api('/push/subscribe', { user: users.provider, method: 'POST', body: { subscription: device } })).status, 200);
    const stale = { endpoint: 'https://fcm.googleapis.com/fcm/send/gone', keys };
    assert.equal((await api('/push/subscribe', { user: users.provider, method: 'POST', body: { subscription: stale } })).status, 200);

    pushes.length = 0;
    const call = (await api('/calls', { user: users.client, method: 'POST', body: { conversation_id: conversation, call_type: 'audio' } })).body.data;
    await new Promise(resolve => setTimeout(resolve, 300));
    const ring = pushes.find(p => p.endpoint === device.endpoint);
    assert.ok(ring, 'the callee device is notified');
    assert.equal(ring.body.kind, 'call');
    assert.equal(ring.body.url, `/chat/${conversation}`);
    assert.equal(ring.options.urgency, 'high');
    assert.ok(ring.options.TTL <= 45, 'the ring expires with the call');
    assert.ok(!JSON.stringify(ring.body).includes('@'), 'no contact details in the notification');
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?', [stale.endpoint])).n), 0, 'expired subscriptions are removed');

    pushes.length = 0;
    await api(`/calls/${call.id}/decline`, { user: users.client, method: 'POST' });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(pushes.find(p => p.endpoint === device.endpoint)?.body.kind, 'call_end', 'a cancelled call clears the notification');

    // The same device signed in to another account rings only for that account.
    await api('/push/subscribe', { user: users.outsider, method: 'POST', body: { subscription: device } });
    assert.equal(Number((await db.queryOne('SELECT user_id FROM push_subscriptions WHERE endpoint = ?', [device.endpoint])).user_id), users.outsider.id);
    await api('/push/unsubscribe', { user: users.outsider, method: 'POST', body: { endpoint: device.endpoint } });
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM push_subscriptions')).n), 0);
  });

  test('unsigned LiveKit webhooks are rejected', async () => {
    const res = await fetch(base.replace(/\/api$/, '') + '/api/calls/livekit-webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/webhook+json', Authorization: 'forged' },
      body: JSON.stringify({ event: 'room_finished', room: { name: 'call_x' } }),
    });
    assert.equal(res.status, 401);
  });
}
