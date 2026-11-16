// Security events in activity_logs (AYK-240): failed sign-ins, lockouts and sign-ins to a
// locked account, so the admin activity page shows suspicious activity. Best-effort: a
// logging failure never breaks the request. No password or code is ever written.
const { query } = require('../config/database');

async function logSecurityEvent(req, action, { userId = null, description = null } = {}) {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, 'auth', ?, ?, ?, ?)`,
      [
        userId, action, userId, description ? String(description).slice(0, 200) : null,
        String(req.ip || '').slice(0, 60),
        String(req.headers?.['user-agent'] || '').slice(0, 240),
      ]
    );
  } catch (_) { /* best-effort */ }
}

module.exports = { logSecurityEvent };
