const { query, queryOne } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { success, error, notFound } = require('../utils/apiResponse');
const contactWindow = require('../utils/contactWindow');

// Members block each other (AYK-084). Not while a request is assigned between them and
// still running or within its review and warranty days.
async function isBlocked(a, b) {
  const row = await queryOne(`SELECT 1 AS hit FROM user_blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`, [a, b, b, a]);
  return Boolean(row);
}

async function workingTogether(a, b) {
  const row = await queryOne(`SELECT r.id FROM requests r WHERE r.deleted_at IS NULL AND r.assigned_provider_id IS NOT NULL
    AND ((r.client_id = ? AND r.assigned_provider_id = ?) OR (r.client_id = ? AND r.assigned_provider_id = ?))
    AND ${contactWindow.OPEN_SQL} LIMIT 1`, [a, b, b, a]);
  return Boolean(row);
}

function targetId(req) {
  const id = Number(req.params.userId);
  return Number.isSafeInteger(id) && id > 0 && id !== req.user.id ? id : null;
}

const block = asyncHandler(async (req, res) => {
  const id = targetId(req);
  if (!id) return error(res, req.t('invalid_data'));
  if (!await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [id])) return notFound(res);
  if (await workingTogether(req.user.id, id)) return error(res, req.t('block_during_work'), 409);
  await query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT (blocker_id, blocked_id) DO NOTHING', [req.user.id, id]);
  return success(res, { blocked: true });
});

const unblock = asyncHandler(async (req, res) => {
  const id = targetId(req);
  if (!id) return error(res, req.t('invalid_data'));
  await query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, id]);
  return success(res, { blocked: false });
});

// From `me`'s side (AYK-107): 'mine' (I blocked them), 'theirs' (they blocked me) or null.
async function blockDirection(me, other) {
  const rows = await query('SELECT blocker_id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [me, other, other, me]);
  if (rows.some(row => Number(row.blocker_id) === Number(me))) return 'mine';
  return rows.length ? 'theirs' : null;
}

// The refusal says who blocked whom.
async function blockedRefusal(req, res, other) {
  const direction = await blockDirection(req.user.id, other);
  if (!direction) return false;
  const { forbidden } = require('../utils/apiResponse');
  forbidden(res, req.t(direction === 'mine' ? 'deny_blocked_by_you' : 'deny_blocked_you'));
  return true;
}

module.exports = { block, unblock, isBlocked, workingTogether, blockDirection, blockedRefusal };
