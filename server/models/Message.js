const { query, queryOne, transaction } = require('../config/database');
const { assertMarketplaceWriteAccess } = require('../middleware/verificationPolicy');
const { validateChatMessage } = require('../utils/chatMessageValidation');
const Conversation = require('./Conversation');

async function create({ conversation_id, sender_id, content, message_type = 'text',
                        reply_to_id = null, files = [],
                        latitude = null, longitude = null, accuracy_m = null }) {
  return transaction(async (conn) => {
    await Conversation.assertCanSend(conversation_id, sender_id, conn);
    const [participants] = await conn.query(`SELECT cp.id FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ? AND cp.user_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
      FOR SHARE OF cp, u`, [conversation_id, sender_id]);
    if (!participants.length) throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
    await assertMarketplaceWriteAccess(sender_id, { query: async (sql, params) => (await conn.query(sql, params))[0] });
    validateChatMessage({ content, message_type, files });
    if (message_type === 'location' && (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))
        || latitude == null || longitude == null || Number(latitude) < -90 || Number(latitude) > 90
        || Number(longitude) < -180 || Number(longitude) > 180
        || (accuracy_m != null && (!Number.isSafeInteger(Number(accuracy_m)) || Number(accuracy_m) < 0 || Number(accuracy_m) > 100000)))) {
      throw Object.assign(new Error('Invalid location'), { status: 400 });
    }
    if (reply_to_id) {
      const [replies] = await conn.query('SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL', [reply_to_id, conversation_id]);
      if (!replies.length) throw Object.assign(new Error('Invalid reply message'), { status: 400 });
    }
    const [result] = await conn.execute(
      `INSERT INTO messages
        (conversation_id, sender_id, content, message_type, reply_to_id,
         latitude, longitude, accuracy_m)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [conversation_id, sender_id, content || null, message_type, reply_to_id,
       latitude, longitude, accuracy_m]
    );
    const messageId = result.insertId;

    if (Array.isArray(files) && files.length) {
      const values = files.map(f => [messageId, f.file_url, f.file_name, f.file_type, f.file_size, f.duration_seconds ?? null]);
      await conn.query(
        `INSERT INTO message_files (message_id, file_url, file_name, file_type, file_size, duration_seconds) VALUES ${values.map(() => '(' + Array(6).fill('?').join(', ') + ')').join(', ')}`,
        values.flat()
      );
    }
    await conn.execute(
      'UPDATE conversations SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
      [messageId, conversation_id]
    );
    return messageId;
  });
}

async function findById(id) {
  const msg = await queryOne(
    `SELECT m.*, u.full_name AS sender_name, u.avatar AS sender_avatar,
            ru.full_name AS reply_sender_name,
            rm.content AS reply_content, rm.message_type AS reply_type
     FROM messages m
     JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id AND rm.conversation_id = m.conversation_id AND rm.deleted_at IS NULL
     LEFT JOIN users ru ON rm.sender_id = ru.id
     WHERE m.id = ? AND m.deleted_at IS NULL`,
    [id]
  );
  if (!msg) return null;
  msg.files = await query('SELECT * FROM message_files WHERE message_id = ?', [id]);
  return msg;
}

async function getSenderId(id) {
  const row = await queryOne(
    'SELECT sender_id, conversation_id FROM messages WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row || null;
}

// includeDeleted: administrators reviewing a dispute also see messages their author deleted.
async function listByConversation(conversationId, { beforeId = null, limit = 50, includeDeleted = false } = {}) {
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
  const params = [conversationId];
  let beforeSql = '';
  if (beforeId) {
    beforeSql = 'AND m.id < ?';
    params.push(beforeId);
  }
  params.push(Number(limit));

  const messages = await query(
    `SELECT m.*, u.full_name AS sender_name, u.avatar AS sender_avatar,
            ru.full_name AS reply_sender_name,
            rm.content AS reply_content, rm.message_type AS reply_type
     FROM messages m
     JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id AND rm.conversation_id = m.conversation_id AND rm.deleted_at IS NULL
     LEFT JOIN users ru ON rm.sender_id = ru.id
     WHERE m.conversation_id = ? ${includeDeleted ? '' : 'AND m.deleted_at IS NULL'} ${beforeSql}
     ORDER BY m.id DESC LIMIT ?`,
    params
  );
  if (!messages.length) return [];

  const ids = messages.map(m => m.id);
  const files = await query(
    `SELECT * FROM message_files WHERE message_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byMsg = {};
  for (const f of files) {
    if (!byMsg[f.message_id]) byMsg[f.message_id] = [];
    byMsg[f.message_id].push(f);
  }
  for (const m of messages) m.files = byMsg[m.id] || [];
  return messages.reverse();
}

async function markRead(messageId) {
  await query('UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?', [messageId]);
}

async function softDelete(id) {
  await query('UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

async function searchInConversation(conversationId, q, { limit = 30 } = {}) {
  return query(
    `SELECT m.id, m.content, m.message_type, m.created_at, m.sender_id,
            u.full_name AS sender_name
     FROM messages m JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = ? AND m.deleted_at IS NULL
       AND m.content LIKE ?
     ORDER BY m.id DESC LIMIT ?`,
    [conversationId, `%${q}%`, Number(limit)]
  );
}

module.exports = {
  create, findById, listByConversation, markRead, softDelete,
  getSenderId, searchInConversation,
};
