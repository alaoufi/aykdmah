// Real PostgreSQL + HTTP; owns only a fresh random loopback test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const port = Number(process.env.AYK_TEST_PORT);
assert.ok([5432, 55432].includes(port), 'Select the dedicated local test PostgreSQL port explicitly');
assert.ok(!process.env.AYK_TEST_HOST || ['127.0.0.1', 'localhost', '::1'].includes(process.env.AYK_TEST_HOST));
const name = `ayk_test_chat_search_${crypto.randomBytes(10).toString('hex')}`;
for (const key of Object.keys(process.env)) if (/DATABASE|^DB_|^PG|^MAIL_|^PAYMENT_|^WHATSAPP_|^NAFATH_|^PUSH_|BOOTSTRAP|^GOOGLE_/.test(key)) process.env[key] = '';
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: name,
  DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', AUTO_MIGRATE: 'false',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
});
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const express = require('express');
const db = require('../config/database');
const jwt = require('../utils/jwt');
const Conversation = require('../models/Conversation');
const { localeMiddleware } = require('../utils/i18n');
const nativeFetch = global.fetch;
let admin, server, base, created = false, users = {}, fixtures = {};
global.fetch = () => { throw new Error('Outbound requests are disabled in synthetic search tests'); };

async function conversation(members, content, requestId = null) {
  const result = await db.query('INSERT INTO conversations (request_id) VALUES (?)', [requestId]);
  const id = result.insertId;
  for (const user of members) await db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [id, user.id]);
  if (content) await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [id, members[0].id, content]);
  return id;
}
async function search(q, { user = users.owner, suffix = '', status = 200 } = {}) {
  const response = await nativeFetch(`${base}/api/chat/conversations?q=${encodeURIComponent(q)}${suffix}`, {
    headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), 'Accept-Language': 'en' },
  });
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(body.success, status === 200);
  return body.data;
}
const ids = rows => rows.map(row => Number(row.id));

test.before(async () => {
  admin = new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`); created = true;
  await admin.query(`ALTER DATABASE "${name}" SET statement_timeout TO '30s'`);
  const setup = await require('../services/installService').setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  for (const [key, role] of [['owner', 'client'], ['provider', 'provider'], ['outsider', 'client'], ['otherProvider', 'provider']]) {
    const result = await db.query('INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [`Synthetic-${key}`, `${key}@test.invalid`, `+96650000000${Object.keys(users).length}`, 'unused-test-hash', role]);
    users[key] = { id: result.insertId, token: jwt.sign({ id: result.insertId, role, auth_version: 0 }) };
  }
  fixtures.arabic = await conversation([users.owner, users.provider], 'نحتاج سباك لإصلاح التسرب');
  const latest = await db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [fixtures.arabic, users.provider.id, 'latest unrelated reply']);
  await db.query('UPDATE conversations SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [latest.insertId, fixtures.arabic]);
  fixtures.deleted = await conversation([users.owner, users.provider], 'deleted-only-needle');
  await db.query('UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE conversation_id = ?', [fixtures.deleted]);
  const request = await db.query('INSERT INTO requests (client_id, assigned_provider_id, title, description) VALUES (?, ?, ?, ?)', [users.owner.id, users.provider.id, 'عنوان صيانة المكيف', 'Synthetic request']);
  fixtures.title = await conversation([users.owner, users.provider], 'unrelated body', request.insertId);
  fixtures.private = await conversation([users.outsider, users.otherProvider], 'سباك private-only-needle');
  fixtures.literal = await conversation([users.owner, users.provider], "O'Reilly ' OR 1=1 -- literal");
  fixtures.pages = [];
  for (let i = 0; i < 105; i++) fixtures.pages.push(await conversation([users.owner, users.provider], 'pagination-only-needle'));
  const app = express(); app.use(express.json()); app.use(localeMiddleware);
  app.use('/api/chat', require('../routes/chatRoutes'));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Synthetic server error' }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 120000 });
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await db.getPool().end();
  if (created) { assert.match(name, /^ayk_test_chat_search_[a-f0-9]{20}$/); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  if (admin) await admin.end(); global.fetch = nativeFetch;
});

test('PostgreSQL finds historical Arabic message content and request titles through HTTP', async () => {
  assert.deepEqual(ids(await search('سباك')), [fixtures.arabic]);
  assert.deepEqual(ids(await search('صيانة المكيف')), [fixtures.title]);
  assert.deepEqual(ids(await search('missing-only-needle')), []);
});
test('counterfactual query without the added message predicate misses the historical Arabic match', async () => {
  // Recreate the pre-fix query in memory only. The live module/file is untouched.
  const fs = require('node:fs');
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const filename = require.resolve('../models/Conversation');
  const source = fs.readFileSync(filename, 'utf8');
  const clause = 'OR EXISTS (SELECT 1 FROM messages matched_message WHERE matched_message.conversation_id = c.id AND matched_message.deleted_at IS NULL AND matched_message.content ILIKE ?) ';
  assert.equal(source.split(clause).length, 2, 'counterfactual must remove exactly the added predicate');
  assert.equal(source.split('Array(5).fill').length, 2);
  const context = { module: { exports: {} }, require: createRequire(filename) };
  vm.runInNewContext(source.replace(clause, '').replace('Array(5).fill', 'Array(4).fill'), context);
  const before = context.module.exports;
  assert.deepEqual(ids(await before.listForUser(users.owner.id, { q: 'سباك' })), []);
  assert.deepEqual(ids(await before.listForUser(users.owner.id, { q: 'صيانة المكيف' })), [fixtures.title]);
  assert.deepEqual(ids(await Conversation.listForUser(users.owner.id, { q: 'سباك' })), [fixtures.arabic]);
});
test('deleted messages, foreign membership and request filters do not leak search matches', async () => {
  assert.deepEqual(ids(await search('deleted-only-needle')), []);
  assert.deepEqual(ids(await search('private-only-needle')), []);
  assert.deepEqual(ids(await search('سباك', { user: users.outsider })), [fixtures.private]);
  assert.deepEqual(ids(await search('صيانة المكيف', { user: users.outsider })), []);
  assert.deepEqual(ids(await search('سباك', { suffix: `&user_id=${users.otherProvider.id}` })), []);
  assert.deepEqual(ids(await search('Synthetic-owner', { user: users.provider })), [], 'hidden requester names are not searchable');
});
test('apostrophes and SQL-like search text stay literal bound parameters', async () => {
  assert.deepEqual(ids(await search("' OR 1=1 --")), [fixtures.literal]);
  assert.deepEqual(ids(await search("O'Reilly")), [fixtures.literal]);
});
test('PostgreSQL search filters before pagination and bounds limit/page', async () => {
  const first = ids(await search('pagination-only-needle', { suffix: '&limit=1000&page=0' }));
  const second = ids(await search('pagination-only-needle', { suffix: '&limit=100&page=2' }));
  assert.equal(first.length, 100); assert.equal(second.length, 5);
  assert.equal(new Set([...first, ...second]).size, 105);
  assert.deepEqual([...first, ...second].sort((a,b) => a-b), [...fixtures.pages].sort((a,b) => a-b));
  assert.deepEqual(ids(await search('pagination-only-needle', { suffix: '&limit=100&page=3' })), []);
  assert.equal((await Conversation.listForUser(users.owner.id, { q: 'pagination-only-needle', page: -5, limit: -1 })).length, 1);
});
test('HTTP rejects invalid query shape/length, invalid filters and missing authentication', async () => {
  await search('x'.repeat(201), { status: 400 });
  await search('x', { suffix: '&q=y', status: 400 });
  await search('سباك', { suffix: '&request_id=invalid', status: 400 });
  await search('سباك', { user: null, status: 401 });
});
