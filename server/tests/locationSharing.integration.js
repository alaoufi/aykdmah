// Use a separate disposable local database for the location TTL/stop lifecycle.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databaseName = process.env.RYZA_LOCATION_TEST_DB;

if (!databaseName) {
  test('location sharing integration (set RYZA_LOCATION_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ryza_test[a-z0-9_]*$/.test(databaseName)) throw new Error('Use a disposable ryza_test* database.');
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: process.env.RYZA_TEST_PORT || '5432',
    DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '',
    DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const db = require('../config/database');
  const LocationShare = require('../models/LocationShare');
  const Conversation = require('../models/Conversation');
  test.before(async () => { await require('../services/installService').setupFromEnv(); });
  test.after(async () => { await db.getPool().end(); });

  test('only the latest live unexpired point is visible, and stopping removes it from polling', async () => {
    const suffix = crypto.randomBytes(5).toString('hex');
    const first = await db.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'client')", ['Location customer', `location_${suffix}@test.invalid`, 'unused-test-hash']);
    const second = await db.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'provider')", ['Location provider', `location_worker_${suffix}@test.invalid`, 'unused-test-hash']);
    const conversationId = await Conversation.findOrCreateBetween(first.insertId, second.insertId);
    const point = (userId, options = {}) => LocationShare.create({
      conversation_id: conversationId, user_id: userId,
      sender_role: userId === first.insertId ? 'client' : 'provider',
      latitude: 26.326, longitude: 43.975, ...options,
    });
    try {
      await point(first.insertId);
      const expired = await point(second.insertId);
      await db.query("UPDATE location_shares SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = ?", [expired.id]);
      await point(second.insertId, { is_live: 0 });
      const latest = await point(first.insertId, { latitude: 26.33 });
      let visible = await LocationShare.getLatestForConversation(conversationId);
      assert.equal(visible.length, 1);
      assert.equal(Number(visible[0].id), Number(latest.id));
      assert.equal(Number(visible[0].latitude), 26.33);
      await LocationShare.stopSharing(first.insertId, conversationId);
      assert.deepEqual(await LocationShare.getLatestForConversation(conversationId), []);
      assert.equal((await LocationShare.getHistory(conversationId, first.insertId)).length, 2);
      const unbounded = await point(second.insertId);
      await db.query('UPDATE location_shares SET expires_at = NULL WHERE id = ?', [unbounded.id]);
      assert.deepEqual(await LocationShare.getLatestForConversation(conversationId), [], 'Every visible point must have an unexpired TTL');
    } finally {
      await db.query('DELETE FROM conversations WHERE id = ?', [conversationId]);
      await db.query('DELETE FROM users WHERE id IN (?, ?)', [first.insertId, second.insertId]);
    }
  });
}
