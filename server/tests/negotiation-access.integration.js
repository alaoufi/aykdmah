// Own a fresh localhost database; never load deployment credentials or mutate
// existing accounts. Exercise the HTTP, model and socket authorization paths.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const port = Number(process.env.AYK_TEST_PORT || 55432);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
const databaseName = `ayk_test_negotiation_${crypto.randomBytes(10).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
  DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), AUTO_MIGRATE: 'false',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '',
  WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', API_RATE_LIMIT: '10000',
});
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const install = require('../services/installService');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const LocationShare = require('../models/LocationShare');
const registerSocket = require('../socket/chatHandler');
let server, base, maintenance, created = false;
let customer, firstProvider, secondProvider, noOfferProvider, outsider;
const nativeFetch = global.fetch;
global.fetch = (...args) => {
  const destination = new URL(args[0]);
  assert.equal(destination.hostname, '127.0.0.1');
  assert.equal(destination.port, String(server.address().port));
  return nativeFetch(...args);
};

async function api(route, { user, body, method = 'GET', expected = 200 } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}), 'Accept-Language': 'en' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${result.message}`);
  return result.data;
}
async function register(role, full_name) {
  return api('/auth/register', { method: 'POST', expected: 201, body: {
    full_name, username: `negotiation_${crypto.randomBytes(6).toString('hex')}`,
    phone: `05${crypto.randomInt(10000000, 99999999)}`, role, password: 'Local-Negotiation-Only-2026',
  } });
}
async function job() {
  const request = await api('/requests', { user: customer, method: 'POST', expected: 201,
    body: { title: 'إصلاح سباكة لاختبار التفاوض', description: 'تفاصيل خاصة للتحقق من عزل مفاوضات مقدمي الخدمة' } });
  const offers = [];
  for (const user of [firstProvider, secondProvider]) {
    offers.push(await api('/offers', { user, method: 'POST', expected: 201,
      body: { request_id: request.id, price: 100, message: 'عرض مقدم الخدمة للتفاوض الخاص' } }));
  }
  return { request, offers };
}
const negotiate = (request, user, peer, expected = 201) => api('/chat/conversations', {
  user, method: 'POST', expected, body: { user_id: peer.user.id, request_id: request.id },
});
const send = (id, user, content, expected = 201) => api(`/chat/conversations/${id}/messages`, {
  user, method: 'POST', expected, body: { content },
});
async function checkReadOnly(id, user) {
  const details = await api(`/chat/conversations/${id}`, { user });
  assert.equal(details.can_send, false);
  assert.equal(await Conversation.canSend(id, user.user.id), false);
  await send(id, user, 'Do not persist after negotiations close', 403);
  await assert.rejects(Message.create({ conversation_id: id, sender_id: user.user.id, content: 'No direct model bypass' }), error => error.status === 403);
}

test.before(async () => {
  maintenance = new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const setup = await install.setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  customer = await register('client', 'عميل تفاوض محلي');
  firstProvider = await register('provider', 'مقدم الخدمة الأول');
  secondProvider = await register('provider', 'مقدم الخدمة الثاني');
  noOfferProvider = await register('provider', 'مقدم الخدمة بدون عرض');
  outsider = await register('client', 'عميل خارج الطلب');
});
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await db.getPool().end();
  if (created) {
    assert.match(databaseName, /^ayk_test_negotiation_[a-f0-9]{20}$/);
    await maintenance.query(`DROP DATABASE "${databaseName}"`);
  }
  if (maintenance) await maintenance.end();
  global.fetch = nativeFetch;
});
test.beforeEach(async () => { await db.query('DELETE FROM auth_rate_limits'); });

test('pending offers permit only owner and that bidder to create, read and send in the exact private pair', async () => {
  const { request } = await job();
  await negotiate(request, customer, noOfferProvider, 403);
  await negotiate(request, noOfferProvider, customer, 403);
  await negotiate(request, outsider, firstProvider, 403);
  await negotiate(request, firstProvider, secondProvider, 403);
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => negotiate(request,
    index % 2 ? firstProvider : customer, index % 2 ? customer : firstProvider)));
  const ids = [...new Set(results.map(result => result.id))];
  assert.equal(ids.length, 1);
  const id = ids[0];
  const details = await api(`/chat/conversations/${id}`, { user: firstProvider });
  assert.equal(details.can_send, true);
  assert.deepEqual(details.participants.map(user => user.id).sort((a, b) => a - b),
    [customer.user.id, firstProvider.user.id].sort((a, b) => a - b));
  await send(id, firstProvider, 'PRIVATE_FIRST_BIDDER_NEGOTIATION');
  await send(id, customer, 'Reply to this provider only');
  assert.equal((await api(`/chat/conversations/${id}/messages`, { user: customer })).length, 2);
  for (const unauthorized of [secondProvider, outsider, noOfferProvider]) {
    await api(`/chat/conversations/${id}`, { user: unauthorized, expected: 403 });
    await api(`/chat/conversations/${id}/messages`, { user: unauthorized, expected: 403 });
    await send(id, unauthorized, 'Private pair bypass', 403);
    assert.ok(!(await api('/chat/conversations', { user: unauthorized })).some(item => item.id === id));
  }
  assert.ok((await Conversation.getContacts(firstProvider.user.id)).some(item => item.id === customer.user.id));
});

test('rejected and withdrawn offers keep existing private history but cannot start or continue a negotiation', async () => {
  for (const status of ['rejected', 'withdrawn']) {
    const { request, offers } = await job();
    const { id } = await negotiate(request, customer, firstProvider);
    await send(id, firstProvider, `History before ${status}`);
    if (status === 'rejected') {
      await api(`/offers/${offers[0].id}/reject`, { user: customer, method: 'PUT', body: {} });
    } else {
      await db.query("UPDATE offers SET status = 'withdrawn' WHERE id = ?", [offers[0].id]);
    }
    await checkReadOnly(id, customer);
    await checkReadOnly(id, firstProvider);
    assert.equal((await negotiate(request, firstProvider, customer)).id, id);
    assert.equal((await api(`/chat/conversations/${id}/messages`, { user: customer }))[0].content, `History before ${status}`);
    await db.query("UPDATE offers SET status = ? WHERE id = ?", [status, offers[1].id]);
    await negotiate(request, customer, secondProvider, 403);
    assert.equal((await api('/chat/conversations', { user: firstProvider })).find(item => item.id === id).can_send, false);
  }
});

test('acceptance keeps only the selected provider writable and never exposes a rival negotiation', async () => {
  const { request, offers } = await job();
  const losing = await negotiate(request, customer, firstProvider);
  const selected = await negotiate(request, secondProvider, customer);
  await send(losing.id, firstProvider, 'SECRET_LOSING_NEGOTIATION');
  await send(selected.id, secondProvider, 'SECRET_SELECTED_NEGOTIATION');
  await api(`/offers/${offers[1].id}/accept`, { user: customer, method: 'PUT', body: {} });
  await checkReadOnly(losing.id, firstProvider);
  await checkReadOnly(losing.id, customer);
  await send(selected.id, secondProvider, 'Selected provider continues');
  await send(selected.id, customer, 'Only selected negotiation continues');
  await api(`/chat/conversations/${losing.id}/messages`, { user: secondProvider, expected: 403 });
  await api(`/chat/conversations/${selected.id}/messages`, { user: firstProvider, expected: 403 });
  assert.deepEqual((await Conversation.getParticipants(losing.id)).map(user => user.id).sort((a, b) => a - b),
    [customer.user.id, firstProvider.user.id].sort((a, b) => a - b));
  assert.deepEqual((await Conversation.getParticipants(selected.id)).map(user => user.id).sort((a, b) => a - b),
    [customer.user.id, secondProvider.user.id].sort((a, b) => a - b));
  const handlers = {};
  registerSocket(null, { user: firstProvider.user, on: (event, handler) => { handlers[event] = handler; } });
  const acknowledgement = await new Promise(resolve => handlers['chat:send']({ conversationId: losing.id, content: 'No socket bypass' }, resolve));
  assert.equal(acknowledgement.ok, false);
  assert.equal(acknowledgement.error, 'forbidden');
});

test('live location is unavailable while negotiating and permitted only in the selected private pair', async () => {
  const { request, offers } = await job();
  const pending = await negotiate(request, customer, firstProvider);
  const selected = await negotiate(request, customer, secondProvider);
  const location = { latitude: 26.326, longitude: 43.975, accuracy_m: 0 };
  for (const user of [customer, firstProvider]) {
    const details = await api(`/chat/conversations/${pending.id}`, { user });
    assert.equal(details.can_send, true);
    assert.equal(details.can_share_location, false);
    assert.equal(await Conversation.canShareLocation(pending.id, user.user.id), false);
    await api(`/chat/conversations/${pending.id}/location`, { user, method: 'POST', body: location, expected: 403 });
    await assert.rejects(LocationShare.create({ conversation_id: pending.id, user_id: user.user.id,
      sender_role: user.user.role, ...location }), error => error.status === 403);
    const handlers = {};
    registerSocket(null, { user: user.user, on: (event, handler) => { handlers[event] = handler; } });
    const ack = await new Promise(resolve => handlers['location:share']({ conversationId: pending.id, ...location }, resolve));
    assert.equal(ack.ok, false);
    assert.equal(ack.error, 'forbidden');
  }
  assert.deepEqual(await LocationShare.getLatestForConversation(pending.id), []);
  await api(`/offers/${offers[1].id}/accept`, { user: customer, method: 'PUT', body: {} });
  for (const user of [customer, secondProvider]) {
    assert.equal((await api(`/chat/conversations/${selected.id}`, { user })).can_share_location, true);
    assert.equal(await Conversation.canShareLocation(selected.id, user.user.id), true);
    await api(`/chat/conversations/${selected.id}/location`, { user, method: 'POST', body: location });
  }
  assert.equal((await api(`/chat/conversations/${selected.id}/location/latest`, { user: customer })).length, 2);
  assert.equal((await api('/chat/conversations', { user: customer })).find(item => item.id === selected.id).can_share_location, true);
  assert.equal((await api('/chat/conversations', { user: firstProvider })).find(item => item.id === pending.id).can_share_location, false);
  await api(`/chat/conversations/${pending.id}/location`, { user: customer, method: 'POST', body: location, expected: 403 });
  await api(`/chat/conversations/${pending.id}/location/latest`, { user: firstProvider });
  await api(`/chat/conversations/${selected.id}/location/latest`, { user: firstProvider, expected: 403 });
  const generic = await api('/chat/conversations', { user: customer, method: 'POST', expected: 201, body: { user_id: noOfferProvider.user.id } });
  assert.equal((await api(`/chat/conversations/${generic.id}`, { user: customer })).can_share_location, true);
  await api(`/chat/conversations/${generic.id}/location`, { user: customer, method: 'POST', body: location });
});

test('additional conversation participants fail closed even when the injected party has their own offer', async () => {
  const { request } = await job();
  const { id } = await negotiate(request, customer, firstProvider);
  await send(id, customer, 'Never expose to an added bidder');
  await db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [id, secondProvider.user.id]);
  for (const user of [customer, firstProvider, secondProvider]) {
    assert.equal(await Conversation.isParticipant(id, user.user.id), false);
    assert.equal(await Conversation.canSend(id, user.user.id), false);
    await api(`/chat/conversations/${id}/messages`, { user, expected: 403 });
  }
  assert.deepEqual(await Conversation.getParticipants(id), []);
});

test('blocked participants and deleted requests cannot authorize negotiation writes or events', async () => {
  const { request } = await job();
  const { id } = await negotiate(request, customer, firstProvider);
  await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [firstProvider.user.id]);
  try {
    assert.equal(await Conversation.isParticipant(id, firstProvider.user.id), false);
    assert.equal(await Conversation.canSend(id, customer.user.id), false);
    await send(id, customer, 'Do not write to blocked bidder', 403);
    assert.ok(!(await Conversation.getParticipants(id)).some(user => user.id === firstProvider.user.id));
  } finally { await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [firstProvider.user.id]); }
  await db.query('UPDATE requests SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [request.id]);
  assert.equal(await Conversation.isParticipant(id, customer.user.id), false);
  await send(id, firstProvider, 'No deleted request bypass', 403);
  assert.deepEqual(await Conversation.getParticipants(id), []);
});

test('a negotiation write waits for an in-flight selection and rejects after the other provider wins', async () => {
  const { request, offers } = await job();
  const { id } = await negotiate(request, customer, firstProvider);
  const selection = await db.getPool().connect();
  let pending;
  try {
    await selection.query('BEGIN');
    await selection.query("UPDATE requests SET assigned_provider_id = $1, accepted_offer_id = $2, status = 'assigned' WHERE id = $3",
      [secondProvider.user.id, offers[1].id, request.id]);
    await selection.query("UPDATE offers SET status = 'rejected' WHERE id = $1", [offers[0].id]);
    pending = Message.create({ conversation_id: id, sender_id: firstProvider.user.id, content: 'Must not slip past acceptance' })
      .then(() => ({ wrote: true }), error => ({ wrote: false, status: error.status }));
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline && !waiting) {
      const result = await maintenance.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = $1 AND wait_event_type = 'Lock' AND query LIKE '%requests%FOR SHARE%') AS waiting`, [databaseName]);
      waiting = result.rows[0].waiting;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, 'The pending message must serialize with request selection');
    await selection.query('COMMIT');
    assert.deepEqual(await pending, { wrote: false, status: 403 });
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?', [id])).total), 0);
  } finally {
    await selection.query('ROLLBACK');
    selection.release();
    if (pending) await pending;
  }
});

test('message and GPS writes wait for actor or counterpart blocking and persist no private data afterward', async () => {
  const { request, offers } = await job();
  const { id } = await negotiate(request, customer, firstProvider);
  await api(`/offers/${offers[0].id}/accept`, { user: customer, method: 'PUT', body: {} });
  const totals = async () => ({
    messages: Number((await db.queryOne('SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?', [id])).total),
    files: Number((await db.queryOne('SELECT COUNT(*) AS total FROM message_files')).total),
    locations: Number((await db.queryOne('SELECT COUNT(*) AS total FROM location_shares WHERE conversation_id = ?', [id])).total),
    conversation: await db.queryOne('SELECT last_message_id, last_message_at FROM conversations WHERE id = ?', [id]),
    defaults: await db.query(`SELECT u.id, u.city_id, u.district_id, u.latitude, u.longitude, up.address
      FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id IN (?, ?) ORDER BY u.id`,
    [customer.user.id, firstProvider.user.id]),
  });
  for (const scenario of ['message_actor', 'location_actor', 'message_counterpart']) {
    const before = await totals();
    const blocking = await db.getPool().connect();
    let pending;
    try {
      await blocking.query('BEGIN');
      await blocking.query('UPDATE users SET is_blocked = 1 WHERE id = $1', [firstProvider.user.id]);
      const sender = scenario === 'message_counterpart' ? customer : firstProvider;
      const operation = scenario === 'location_actor'
        ? LocationShare.create({ conversation_id: id, user_id: sender.user.id, sender_role: sender.user.role,
          latitude: 26.326, longitude: 43.975 })
        : Message.create({ conversation_id: id, sender_id: sender.user.id, content: 'No data after blocking',
          message_type: 'file', files: [{ file_url: '/uploads/local-test.txt', file_name: 'local-test.txt',
            file_type: 'text/plain', file_size: 16 }] });
      pending = operation.then(() => ({ wrote: true }), error => ({ wrote: false, status: error.status }));
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const result = await maintenance.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = $1 AND wait_event_type = 'Lock' AND query LIKE '%conversation_participants%FOR SHARE%') AS waiting`, [databaseName]);
        waiting = result.rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true, `${scenario} must serialize with the pending account block`);
      await blocking.query('COMMIT');
      assert.deepEqual(await pending, { wrote: false, status: 403 });
      assert.deepEqual(await totals(), before, `${scenario} must not write a message, file, GPS point or account defaults`);
    } finally {
      await blocking.query('ROLLBACK');
      blocking.release();
      if (pending) await pending;
      await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [firstProvider.user.id]);
    }
  }
});
