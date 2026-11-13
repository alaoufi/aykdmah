const { query, queryOne } = require('../config/database');

async function create({ user_id, type, title, body, data, link, channel = 'in_app' }) {
  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, data, link, channel)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, type, title, body || null, data ? JSON.stringify(data) : null, link || null, channel]
  );
  return queryOne('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
}

async function listForUser(userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = ['user_id = ?'];
  const params = [userId];
  if (unreadOnly) where.push('is_read = 0');
  const whereSql = where.join(' AND ');

  const items = await query(
    `SELECT * FROM notifications WHERE ${whereSql}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`,
    params
  );
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return { items, total, unread };
}

async function markRead(id, userId) {
  await query(
    'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [id, userId]
  );
}

async function markAllRead(userId) {
  await query(
    'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
    [userId]
  );
}

module.exports = { create, listForUser, markRead, markAllRead };
