const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function capture() {
  const calls = [];
  const context = { module: { exports: {} }, require: name => name.endsWith('/database')
    ? { query: async (sql, params) => { calls.push({ sql, params: Array.from(params) }); return []; } }
    : require('../utils/contactWindow') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../models/Conversation'), 'utf8'), context);
  return { model: context.module.exports, calls };
}
for (const term of ['needle', '\u0633\u0628\u0627\u0643', "' OR 1=1 --"]) {
  test(`conversation search binds all searchable fields: ${term}`, async () => {
    const { model, calls } = capture();
    await model.listForUser(17, { q: term, page: 3, limit: 20 });
    const { sql, params } = calls[0];
    assert.deepEqual(params, [17,17,17,17,17,...Array(5).fill(`%${term}%`),20,40]);
    assert.equal(sql.includes(term), false);
    assert.match(sql, /r\.title ILIKE \?/);
    assert.match(sql, /person\.referral_code ILIKE \? OR saved\.nickname ILIKE \? OR \(person\.role <> 'client' AND person\.full_name ILIKE \?\)/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM messages matched_message WHERE matched_message\.conversation_id = c\.id AND matched_message\.deleted_at IS NULL AND matched_message\.content ILIKE \?\)/);
    assert.ok(sql.indexOf('matched_message.content ILIKE ?') < sql.indexOf('LIMIT ? OFFSET ?'));
    assert.match(sql, /WHERE cp\.user_id = \? AND self_user\.deleted_at IS NULL AND self_user\.is_active = 1 AND self_user\.is_blocked = 0/);
    assert.match(sql, /AND cp\.user_id IN \(owner_member\.user_id, provider_member\.user_id\)/);
    assert.match(sql, /saved\.user_id = cp\.user_id/);
  });
}
test('empty search retains pagination and scoped request/peer filters without message search', async () => {
  const { model, calls } = capture();
  await model.listForUser(29, { requestId: 7, peerId: 8, page: 2, limit: 10 });
  assert.deepEqual(calls[0].params, [29,29,29,29,29,7,8,10,10]);
  assert.equal(calls[0].sql.includes('matched_message'), false);
  assert.match(calls[0].sql, /AND c\.request_id = \? AND EXISTS/);
});

test('actual message predicate finds historical Arabic content with membership and pagination (SQLite fixture)', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const { model, calls } = capture();
  await model.listForUser(17, { q: 'fixture' });
  const predicate = calls[0].sql.match(/EXISTS \(SELECT 1 FROM messages matched_message[^)]+\)/)[0].replace('ILIKE', 'LIKE');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE conversations(id INTEGER PRIMARY KEY, last_message_id INTEGER);
      CREATE TABLE conversation_participants(conversation_id INTEGER,user_id INTEGER);
      CREATE TABLE messages(id INTEGER,conversation_id INTEGER,content TEXT,deleted_at TEXT);
      INSERT INTO conversations VALUES(1,12),(2,22),(3,31),(4,41);
      INSERT INTO conversation_participants VALUES(1,17),(2,17),(3,17),(4,99);
      INSERT INTO messages VALUES(11,1,'old needle',NULL),(12,1,'latest unrelated',NULL),
        (21,2,'needle',NULL),(22,2,'latest unrelated',NULL),(31,3,'needle','deleted'),(41,4,'private needle',NULL);`);
    db.prepare('INSERT INTO messages VALUES(13,1,?,NULL)').run('\u0633\u0628\u0627\u0643');
    const query = db.prepare(`SELECT c.id FROM conversations c JOIN conversation_participants cp ON cp.conversation_id=c.id WHERE cp.user_id=? AND ${predicate} ORDER BY c.id LIMIT ? OFFSET ?`);
    const ids = (user,term,limit=20,offset=0) => query.all(user,`%${term}%`,limit,offset).map(row=>row.id);
    assert.deepEqual(ids(17,'needle'),[1,2]);
    assert.deepEqual(ids(17,'needle',1,1),[2]);
    assert.deepEqual(ids(17,'\u0633\u0628\u0627\u0643'),[1]);
    assert.deepEqual(ids(17,'missing'),[]);
    assert.deepEqual(ids(99,'needle'),[4]);
    assert.deepEqual(ids(77,'needle'),[]);
  } finally { db.close(); }
});
