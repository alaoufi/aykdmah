const { query } = require('../config/database');

// A device endpoint belongs to whoever signed in on it last.
async function save(userId, { endpoint, keys }, lang = 'ar') {
  await query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  await query('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang) VALUES (?, ?, ?, ?, ?)',
    [userId, endpoint, keys.p256dh, keys.auth, lang]);
}

const remove = (userId, endpoint) =>
  query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);

const removeEndpoint = endpoint => query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);

async function listForUser(userId) {
  const rows = await query('SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 10', [userId]);
  return rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, lang: r.lang }));
}

module.exports = { save, remove, removeEndpoint, listForUser };
