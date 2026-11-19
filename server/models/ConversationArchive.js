const { query, queryOne } = require('../config/database');

async function archiveConversation(conversationId, { archived_by = null, retention_days = 90 } = {}) {
  retention_days = Math.max(1, Math.min(3650, Number.parseInt(retention_days, 10) || 90));
  const conv = await queryOne(
    'SELECT * FROM conversations WHERE id = ?', [conversationId]
  );
  if (!conv) return null;
  const messages = await query(
    `SELECT m.*, u.full_name AS sender_name
     FROM messages m JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC`,
    [conversationId]
  );
  const ids = messages.map(m => m.id);
  let files = [];
  if (ids.length) {
    files = await query(
      `SELECT * FROM message_files WHERE message_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
  }
  const locations = await query(
    `SELECT * FROM location_shares WHERE conversation_id = ? ORDER BY id ASC`,
    [conversationId]
  );
  const payload = JSON.stringify({ conversation: conv, messages, files, locations });
  const firstAt = messages.length ? messages[0].created_at : null;
  const lastAt = messages.length ? messages[messages.length - 1].created_at : null;
  const result = await query(
    `INSERT INTO conversation_archives
      (conversation_id, request_id, message_count, first_message_at, last_message_at,
       archived_by, expires_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY), ?)`,
    [conversationId, conv.request_id, messages.length, firstAt, lastAt,
     archived_by, retention_days, payload]
  );
  return queryOne('SELECT id, conversation_id, request_id, message_count, archived_at, expires_at, status FROM conversation_archives WHERE id = ?', [result.insertId]);
}

async function list({ status = 'active', page = 1, limit = 30 } = {}) {
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 30));
  await purgeExpired();
  const offset = (page - 1) * limit;
  const items = await query(
    `SELECT a.id, a.conversation_id, a.request_id, a.message_count,
            a.first_message_at, a.last_message_at, a.archived_at,
            a.expires_at, a.status,
            r.title AS request_title
     FROM conversation_archives a
     LEFT JOIN requests r ON a.request_id = r.id
     WHERE a.status = ?
     ORDER BY a.archived_at DESC LIMIT ? OFFSET ?`,
    [status, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM conversation_archives WHERE status = ?',
    [status]
  );
  return { items, total };
}

async function findById(id) {
  await query(`UPDATE conversation_archives SET status = 'expired', payload = NULL
    WHERE id = ? AND status IN ('active', 'restored') AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`, [id]);
  return queryOne('SELECT * FROM conversation_archives WHERE id = ?', [id]);
}

async function purgeExpired() {
  const expired = await query(
    `SELECT id FROM conversation_archives
      WHERE status IN ('active', 'restored') AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
  );
  if (!expired.length) return 0;
  await query(
    `UPDATE conversation_archives SET status = 'expired', payload = NULL
     WHERE id IN (${expired.map(() => '?').join(',')})`,
    expired.map(e => e.id)
  );
  return expired.length;
}

async function restore(id) {
  await query(
    `UPDATE conversation_archives SET status = 'restored' WHERE id = ? AND status = 'active'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [id]
  );
}

async function remove(id) {
  await query(
    `UPDATE conversation_archives SET status = 'deleted', payload = NULL WHERE id = ?`,
    [id]
  );
}

module.exports = { archiveConversation, list, findById, purgeExpired, restore, remove };
