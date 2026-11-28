// AYK-512 (the owner, looking at the security report: «كيف نجح؟ لا يفرّق بين العدو والصديق»): the site cannot tell a friend
// from a foe, it only checks the password. So the owner is told at once when an administration account signs in from an
// address it has not signed in from in the last 180 days, and can answer «that was me» or change the password.
// The first ever sign-in of an account has nothing to compare with, so it is not an alert.
const { queryOne, query } = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const DAYS = 180;

// Call BEFORE the sign-in is written to the log, or it would always find itself.
async function alertIfNewAdminIp(req, user) {
  try {
    const ip = String(req.ip || '').slice(0, 60);
    if (!ip || !user?.id) return false;
    const history = await queryOne(`SELECT COUNT(*) AS n FROM activity_logs WHERE user_id = ? AND action = 'admin_login'`, [user.id]);
    if (!Number(history?.n)) return false;
    const known = await queryOne(
      `SELECT 1 AS seen FROM activity_logs WHERE user_id = ? AND action = 'admin_login' AND ip_address = ? AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${DAYS} days' LIMIT 1`,
      [user.id, ip]);
    if (known) return false;
    const device = String(req.headers?.['user-agent'] || '').slice(0, 80) || 'غير معروف';
    const supers = await query('SELECT id FROM users WHERE is_super_admin = 1 AND is_active = 1').catch(() => []);
    const recipients = [...new Set([user.id, ...supers.map(row => Number(row.id))])];
    const who = user.full_name || user.username || `#${user.id}`;
    for (const id of recipients) {
      await notificationService.notifyUser(id, {
        type: 'admin_new_ip',
        title: 'دخول لوحة الإدارة من عنوان جديد',
        body: `دخل «${who}» لوحة الإدارة من العنوان ${ip} (جهاز: ${device}). إن لم تكن أنت فغيّر كلمة المرور فورًا.`,
        link: '/admin/security',
      });
    }
    return true;
  } catch (err) {
    logger.warn('Admin new-address alert failed:', err.message);
    return false;
  }
}

module.exports = { alertIfNewAdminIp };
