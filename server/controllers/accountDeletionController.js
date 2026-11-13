const crypto = require('crypto');
const { query, queryOne, transaction } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { comparePassword, hashPassword } = require('../utils/hash');
const logger = require('../utils/logger');

// Deleting one's own account (AYK-116), as Google Play requires: from the app and from the web
// (/delete-account). Identity data is erased and the account closed at once; past messages stay
// in the other side's chats as "Deleted user", and payment records are kept as the law requires.
const deleteMe = asyncHandler(async (req, res) => {
  const user = await queryOne('SELECT id, role, password_hash FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
  if (!user) return error(res, req.t('account_not_found'), 404);
  if (user.role === 'admin') return error(res, req.t('account_delete_admin'), 403);
  if (!await comparePassword(String(req.body?.password || ''), user.password_hash || '')) return error(res, req.t('account_delete_wrong_password'), 400);
  // Not while work is under way: name the jobs so they can be finished or left first.
  const jobs = await query(`SELECT id, title, status FROM requests WHERE deleted_at IS NULL AND status IN ('assigned', 'in_progress')
    AND (assigned_provider_id = ? OR client_id = ?) ORDER BY id LIMIT 20`, [user.id, user.id]);
  if (jobs.length) return error(res, req.t('account_delete_active_jobs'), 409, { jobs: jobs.map(j => ({ id: j.id, title: j.title, status: j.status })) });

  const scrambled = await hashPassword(crypto.randomBytes(24).toString('hex'));
  await transaction(async conn => {
    await conn.execute(`UPDATE users SET full_name = ?, email = NULL, phone = NULL, username = NULL, facebook_id = NULL,
      avatar = NULL, password_hash = ?, is_active = 0, deleted_at = CURRENT_TIMESTAMP, auth_version = auth_version + 1 WHERE id = ?`,
    [req.t('account_deleted_name'), scrambled, user.id]);
    await conn.execute("UPDATE requests SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE client_id = ? AND status = 'open' AND deleted_at IS NULL", [user.id]);
    await conn.execute("UPDATE offers SET status = 'withdrawn' WHERE provider_id = ? AND status = 'pending'", [user.id]);
    for (const sql of [
      'DELETE FROM push_subscriptions WHERE user_id = ?',
      'DELETE FROM native_push_tokens WHERE user_id = ?',
      'DELETE FROM saved_providers WHERE user_id = ? OR provider_id = ?',
      'DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?',
      'DELETE FROM device_reports WHERE user_id = ?',
    ]) await conn.execute(sql, sql.includes(' OR ') ? [user.id, user.id] : [user.id]);
  });
  const io = req.app.get('io');
  if (io) io.in(`user:${user.id}`).disconnectSockets(true);
  logger.info(`Account deleted by its owner: user=${user.id}`);
  return success(res, { deleted: true }, req.t('account_deleted'));
});

module.exports = { deleteMe };
