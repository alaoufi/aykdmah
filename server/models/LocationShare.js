const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { optionalNumber, pagination } = require('./Request');
const Conversation = require('./Conversation');

async function create({ conversation_id, request_id = null, user_id, sender_role, latitude, longitude, accuracy_m = null, heading = null, speed_kmh = null, is_live = 1, ttl_minutes = 30 }) {
  latitude = optionalNumber(latitude, -90, 90); longitude = optionalNumber(longitude, -180, 180);
  if (latitude == null || longitude == null) throw new ApiError('invalid_coordinates', 422);
  accuracy_m = optionalNumber(accuracy_m, 0, 10000000, true);
  heading = optionalNumber(heading, 0, 359.99); speed_kmh = optionalNumber(speed_kmh, 0, 999.99);
  ttl_minutes = optionalNumber(ttl_minutes, 1, 1440, true);
  if (ttl_minutes == null || !['client','provider','admin'].includes(sender_role)) throw new ApiError('invalid_data', 422);
  return transaction(async conn => {
    await Conversation.assertCanShareLocation(conversation_id, user_id, conn);
    const [[reference]] = await conn.query('SELECT request_id FROM conversations WHERE id = ?', [conversation_id]);
    request_id = reference.request_id;
    await conn.execute('UPDATE location_shares SET is_live = 0 WHERE conversation_id = ? AND user_id = ? AND is_live = 1', [conversation_id, user_id]);
    const [rows] = await conn.execute(
      `INSERT INTO location_shares
        (conversation_id, request_id, user_id, sender_role, latitude, longitude,
         accuracy_m, heading, speed_kmh, is_live, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))`,
      [conversation_id, request_id, user_id, sender_role, latitude, longitude, accuracy_m, heading, speed_kmh, is_live ? 1 : 0, ttl_minutes]);
    return rows[0];
  });
}

// Latest live point per participant
async function getLatestForConversation(conversationId) {
  return query(
    `SELECT ls.*, u.full_name, u.avatar, u.role AS user_role
     FROM location_shares ls
     JOIN users u ON ls.user_id = u.id
     JOIN conversations c ON c.id = ls.conversation_id
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ls.user_id
     LEFT JOIN requests r ON r.id = c.request_id
     JOIN (
       SELECT user_id, MAX(id) AS max_id
       FROM location_shares
       WHERE conversation_id = ? AND is_live = 1
         AND expires_at > CURRENT_TIMESTAMP
       GROUP BY user_id
     ) latest ON latest.max_id = ls.id
     WHERE u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
       AND (c.request_id IS NULL OR (r.deleted_at IS NULL AND ls.user_id IN (r.client_id, r.assigned_provider_id)))
     ORDER BY ls.created_at DESC`,
    [conversationId]
  );
}

async function getHistory(conversationId, userId, { limit = 100 } = {}) {
  ({ limit } = pagination(1, limit));
  return query(
    `SELECT * FROM location_shares
     WHERE conversation_id = ? AND user_id = ?
     ORDER BY id DESC LIMIT ?`,
    [conversationId, userId, Number(limit)]
  );
}

async function stopSharing(userId, conversationId) {
  await query(
    `UPDATE location_shares SET is_live = 0
     WHERE user_id = ? AND conversation_id = ? AND is_live = 1`,
    [userId, conversationId]
  );
}

module.exports = { create, getLatestForConversation, getHistory, stopSharing };
