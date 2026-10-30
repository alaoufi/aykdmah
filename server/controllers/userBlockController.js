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

module.exports = { block, unblock, isBlocked, workingTogether };
