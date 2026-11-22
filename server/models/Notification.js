const { query, queryOne } = require('../config/database');

async function create({ user_id, type, title, body, data, link, channel = 'in_app' }) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, data, link, channel)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, type, title, body || null, data ? JSON.stringify(data) : null, link || null, channel]
  );
  // The insert already returns the stored row (the database layer adds RETURNING *): no second read.
  return result[0] || queryOne('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
}

// AYK-363 (the owner: «كل رسالة تتحول وكأنها محادثة… الصحيح كل الرسائل داخل محادثة واحدة بين طرفين
// مثل الواتساب تمامًا حتى لو قديمة»). Notifications that open the same conversation are one entry:
// the newest of them, with how many there are and how many are unread. Nothing is deleted; reading
// the entry reads all of them. Other notifications stay one entry each.
// AYK-364 (the owner: «إذا كانت من شخص واحد تكون داخل محادثة واحدة»): grouped by the other person in
// the conversation, so one person's messages are one entry even across several conversations.
const CHAT_ID = "CASE WHEN link ~ '^/chat/[0-9]{1,9}$' THEN CAST(SUBSTRING(link FROM 7) AS INTEGER) END";
const PEER = `(SELECT MIN(cp.user_id) FROM conversation_participants cp WHERE cp.conversation_id = ${CHAT_ID} AND cp.user_id <> notifications.user_id)`;
const GROUP_KEY = `CASE WHEN link ~ '^/chat/[0-9]{1,9}$' THEN COALESCE('p:' || CAST(${PEER} AS TEXT), link) ELSE CONCAT('n:', id) END`;

// AYK-458 (the owner: «الإدارة بالكامل إدارة، لا علاقة لها بالموقع، فصل كامل»). One account may be both
// a person on the site and an administrator (AYK-383, separate sessions), so the notices are split by
// where they open: the admin area's bell shows only those that open an /admin page; the site never shows them.
const ADMIN_ONLY = "COALESCE(link, '') LIKE '/admin%'";
async function listForUser(userId, { unreadOnly = false, page = 1, limit = 20, scope = '' } = {}) {
  const only = scope === 'admin' ? ` AND ${ADMIN_ONLY}` : ` AND NOT (${ADMIN_ONLY})`;
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const offset = (page - 1) * limit;
  const base = `SELECT notifications.*, ${GROUP_KEY} AS group_key FROM notifications WHERE user_id = ?${only}`;
  const groups = `WITH g AS (${base}),
    s AS (SELECT group_key, COUNT(*) AS group_count, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS group_unread FROM g GROUP BY group_key),
    latest AS (SELECT DISTINCT ON (group_key) * FROM g ORDER BY group_key, (type = 'new_message') DESC, created_at DESC, id DESC)
    SELECT latest.*, s.group_count, s.group_unread FROM latest JOIN s ON s.group_key = latest.group_key
    ${unreadOnly ? 'WHERE s.group_unread > 0' : ''}`;

  const rows = await query(`${groups} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [userId, Number(limit), Number(offset)]);
  const items = rows.map(({ group_key, ...row }) => ({
    ...row,
    group_count: Number(row.group_count) || 1,
    group_unread: Number(row.group_unread) || 0,
    // The entry is unread while any message in it is.
    is_read: Number(row.group_unread) > 0 ? 0 : 1,
  }));
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM (${groups}) t`, [userId]);
  const [{ unread }] = await query(
    `SELECT COUNT(DISTINCT ${GROUP_KEY}) AS unread FROM notifications WHERE user_id = ? AND is_read = 0${only}`,
    [userId]
  );
  return { items, total: Number(total), unread: Number(unread) };
}

async function markRead(id, userId) {
  // Reading a conversation's entry reads every notification of that conversation.
  await query(
    `UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND is_read = 0 AND (id = ? OR ${GROUP_KEY} = (SELECT ${GROUP_KEY} FROM notifications WHERE id = ? AND user_id = ?))`,
    [userId, id, id, userId]
  );
}

// Opening a conversation reads the notifications of every conversation with the same person.
async function markConversationRead(userId, conversationId) {
  const link = `/chat/${Number(conversationId)}`;
  await query(
    `UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND is_read = 0 AND (link = ? OR ${GROUP_KEY} = (
       SELECT COALESCE('p:' || CAST(MIN(cp.user_id) AS TEXT), ?) FROM conversation_participants cp WHERE cp.conversation_id = ? AND cp.user_id <> ?))`,
    [userId, link, link, Number(conversationId), userId]
  );
}

async function markAllRead(userId, scope = '') {
  await query(
    `UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0 AND ${scope === 'admin' ? ADMIN_ONLY : `NOT (${ADMIN_ONLY})`}`,
    [userId]
  );
}

module.exports = { create, listForUser, markRead, markAllRead, markConversationRead };
