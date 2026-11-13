const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { pagination, optionalNumber } = require('./Request');
const { hasPermission } = require('../middleware/roleCheck');

async function open({ request_id, opened_by, subject, description }) {
  request_id = optionalNumber(request_id, 1, 2147483647, true);
  if (!Number.isSafeInteger(Number(request_id)) || Number(request_id) < 1 || Number(request_id) > 2147483647
      || typeof subject !== 'string' || subject.trim().length < 3 || subject.length > 200 || subject.includes('\0')
      || (description != null && (typeof description !== 'string' || description.length > 10000 || description.includes('\0')))) throw new ApiError('invalid_data', 422);
  return transaction(async conn => {
    const [[request]] = await conn.query('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [request_id]);
    if (!request) throw new ApiError('request_not_found', 404);
    if (!request.assigned_provider_id || request.status === 'open') throw new ApiError('order_not_assigned', 409);
    const [[user]] = await conn.query('SELECT role, is_super_admin, permissions FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0', [opened_by]);
    if (user && typeof user.permissions === 'string') { try { user.permissions = JSON.parse(user.permissions); } catch (_) { user.permissions = []; } }
    if (!user || (!hasPermission(user, 'disputes.manage') && ![request.client_id, request.assigned_provider_id].includes(opened_by))) throw new ApiError('forbidden', 403);
    const [[existing]] = await conn.query("SELECT id FROM disputes WHERE request_id = ? AND status IN ('open','under_review','waiting_response','escalated') LIMIT 1", [request_id]);
    if (existing) throw new ApiError('dispute_exists', 409);
    const [[conv]] = await conn.query(`SELECT c.id FROM conversations c
      JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ?
      JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ?
      WHERE c.request_id = ? AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = c.id) = 2
      ORDER BY c.id LIMIT 1`, [request.client_id, request.assigned_provider_id, request_id]);
    const [result] = await conn.execute(
      `INSERT INTO disputes (request_id, conversation_id, opened_by, subject, description) VALUES (?, ?, ?, ?, ?)`,
      [request_id, conv?.id || null, opened_by, subject.trim(), description || null]);
    const role = hasPermission(user, 'disputes.manage') ? 'admin' : opened_by === request.client_id ? 'client' : 'provider';
    await conn.execute(`INSERT INTO dispute_status_logs (dispute_id, from_status, to_status, changed_by, changed_role, note)
      VALUES (?, NULL, 'open', ?, ?, 'dispute opened')`, [result.insertId, opened_by, role]);
    return result.insertId;
  });
}

async function findById(id) {
  return queryOne(
    `SELECT d.*,
            ob.full_name AS opened_by_name,
            ad.full_name AS assigned_admin_name,
            r.title AS request_title
     FROM disputes d
     LEFT JOIN users ob ON d.opened_by = ob.id
     LEFT JOIN users ad ON d.assigned_admin_id = ad.id
     LEFT JOIN requests r ON d.request_id = r.id
     WHERE d.id = ?`,
    [id]
  );
}

async function list({ status, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  if (status) { where.push('d.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = await query(
    `SELECT d.id, d.subject, d.status, d.opened_at, d.resolved_at, d.request_id,
            d.conversation_id, d.opened_by, d.assigned_admin_id,
            ob.full_name AS opened_by_name,
            ad.full_name AS assigned_admin_name,
            r.title AS request_title
     FROM disputes d
     LEFT JOIN users ob ON d.opened_by = ob.id
     LEFT JOIN users ad ON d.assigned_admin_id = ad.id
     LEFT JOIN requests r ON d.request_id = r.id
     ${whereSql}
     ORDER BY d.opened_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM disputes d ${whereSql}`,
    params
  );
  return { items, total };
}

async function assign(id, adminId) {
  await changeStatus(id, 'under_review', { changedBy: adminId, role: 'admin', assignedAdmin: adminId, note: 'chat access requested' });
  return findById(id);
}

async function resolve(id, resolution, options = {}) {
  await changeStatus(id, 'resolved', { ...options, resolution });
  return findById(id);
}

async function close(id, options = {}) {
  await changeStatus(id, 'closed', options);
  return findById(id);
}

async function logAccess({ dispute_id, admin_id, conversation_id = null, order_id = null, action, reason = null, ip_address = null }) {
  await query(
    `INSERT INTO dispute_access_logs
      (dispute_id, admin_id, conversation_id, order_id, action, reason, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [dispute_id, admin_id, conversation_id, order_id, action, reason, ip_address]
  );
}

async function getAccessLogs(disputeId) {
  return query(
    `SELECT l.*, u.full_name AS admin_name
     FROM dispute_access_logs l
     JOIN users u ON l.admin_id = u.id
     WHERE l.dispute_id = ?
     ORDER BY l.opened_at DESC`,
    [disputeId]
  );
}

// Used by chatController to allow a dispute admin to read a conversation
async function findActiveForConversation(conversationId) {
  return queryOne(
    `SELECT * FROM disputes
     WHERE conversation_id = ? AND status IN ('open','under_review','waiting_response','escalated')
     ORDER BY opened_at DESC LIMIT 1`,
    [conversationId]
  );
}

// Used by reviewController to block reviews while a dispute is active.
async function findActiveForRequest(requestId) {
  return queryOne(
    `SELECT * FROM disputes
     WHERE request_id = ? AND status IN ('open','under_review','waiting_response','escalated')
     ORDER BY opened_at DESC LIMIT 1`,
    [requestId]
  );
}

// ---- Status workflow ----
const TERMINAL = new Set(['resolved', 'rejected', 'closed']);

async function changeStatus(id, newStatus, { changedBy, role = 'admin', note = null, resolution, ratingsAllowed, assignedAdmin, frozen, chatLocked } = {}) {
  const transitions = {
    open: ['under_review','waiting_response','escalated','resolved','rejected','closed'],
    under_review: ['waiting_response','escalated','resolved','rejected','closed'],
    waiting_response: ['under_review','escalated','resolved','rejected','closed'],
    escalated: ['under_review','waiting_response','resolved','rejected','closed'],
    resolved: ['closed'], rejected: ['closed'], closed: [],
  };
  if (!Object.hasOwn(transitions, newStatus) || (note != null && (typeof note !== 'string' || note.length > 500 || note.includes('\0')))
      || (resolution != null && (typeof resolution !== 'string' || resolution.length > 10000 || resolution.includes('\0')))
      || (ratingsAllowed !== undefined && !['both','client_only','provider_only','none','pending'].includes(ratingsAllowed))
      || (frozen !== undefined && typeof frozen !== 'boolean') || (chatLocked !== undefined && typeof chatLocked !== 'boolean')) throw new ApiError('invalid_data', 422);
  return transaction(async conn => {
    const [[reference]] = await conn.query('SELECT request_id FROM disputes WHERE id = ?', [id]);
    if (!reference) throw new ApiError('dispute_not_found', 404);
    if (reference.request_id) await conn.query('SELECT id FROM requests WHERE id = ? FOR UPDATE', [reference.request_id]);
    const [[dispute]] = await conn.query('SELECT * FROM disputes WHERE id = ? FOR UPDATE', [id]);
    if (!dispute) throw new ApiError('dispute_not_found', 404);
    const fromStatus = dispute.status;
    if (fromStatus !== newStatus && !transitions[fromStatus]?.includes(newStatus)) throw new ApiError('invalid_status_transition', 409);
    const fields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [newStatus];
    if (newStatus === 'resolved' && fromStatus !== newStatus) fields.push('resolved_at = CURRENT_TIMESTAMP');
    if (newStatus === 'closed' && fromStatus !== newStatus) fields.push('closed_at = CURRENT_TIMESTAMP');
    for (const [field, value] of [['resolution', resolution], ['ratings_allowed', ratingsAllowed], ['assigned_admin_id', assignedAdmin], ['frozen', frozen], ['chat_locked', chatLocked]]) {
      if (value !== undefined) { fields.push(`${field} = ?`); values.push(typeof value === 'boolean' ? Number(value) : value); }
    }
    await conn.execute(`UPDATE disputes SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (fromStatus !== newStatus) await conn.execute(
      `INSERT INTO dispute_status_logs (dispute_id, from_status, to_status, changed_by, changed_role, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fromStatus, newStatus, changedBy, role, note]);
  });
}

async function setRatingsAllowed(id, value) {
  if (!['both','client_only','provider_only','none','pending'].includes(value)) throw new ApiError('invalid_data', 422);
  await query('UPDATE disputes SET ratings_allowed = ? WHERE id = ?', [value, id]);
}

async function setFrozen(id, frozen) {
  await query('UPDATE disputes SET frozen = ? WHERE id = ?', [frozen ? 1 : 0, id]);
}

async function setChatLocked(id, locked) {
  await query('UPDATE disputes SET chat_locked = ? WHERE id = ?', [locked ? 1 : 0, id]);
}

async function getStatusLogs(disputeId) {
  return query(
    `SELECT l.*, u.full_name AS author_name FROM dispute_status_logs l
     JOIN users u ON l.changed_by = u.id
     WHERE l.dispute_id = ? ORDER BY l.created_at ASC`,
    [disputeId]
  );
}

async function assertWritable(conn, disputeId, user) {
  const [[reference]] = await conn.query('SELECT request_id FROM disputes WHERE id = ?', [disputeId]);
  if (!reference) throw new ApiError('dispute_not_found', 404);
  let request;
  if (reference.request_id) [[request]] = await conn.query('SELECT client_id, assigned_provider_id, deleted_at FROM requests WHERE id = ? FOR SHARE', [reference.request_id]);
  const [[dispute]] = await conn.query('SELECT status FROM disputes WHERE id = ? FOR SHARE', [disputeId]);
  if (!dispute) throw new ApiError('dispute_not_found', 404);
  const admin = hasPermission(user, 'disputes.manage');
  if (!admin && (!request || request.deleted_at || ![request.client_id, request.assigned_provider_id].includes(user.id))) throw new ApiError('forbidden', 403);
  if (!admin && TERMINAL.has(dispute.status)) throw new ApiError('dispute_closed', 409);
  return { request, dispute, admin };
}

// ---- Messages (clarifications + admin notes) ----
async function postMessage({ dispute_id, author_id, author_role, body, is_internal = false }) {
  if (typeof body !== 'string' || !body.trim() || body.length > 10000 || body.includes('\0')) throw new ApiError('invalid_data', 422);
  return transaction(async conn => {
    const [[user]] = await conn.query('SELECT id, role, is_super_admin, permissions FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0', [author_id]);
    if (!user) throw new ApiError('forbidden', 403);
    if (typeof user.permissions === 'string') { try { user.permissions = JSON.parse(user.permissions); } catch (_) { user.permissions = []; } }
    const { request, admin } = await assertWritable(conn, dispute_id, user);
    author_role = admin ? 'admin' : request.client_id === user.id ? 'client' : 'provider';
    if (is_internal && !hasPermission(user, 'disputes.manage')) throw new ApiError('forbidden', 403);
    const [rows] = await conn.execute(
      `INSERT INTO dispute_messages (dispute_id, author_id, author_role, body, is_internal) VALUES (?, ?, ?, ?, ?)`,
      [dispute_id, author_id, author_role, body, is_internal ? 1 : 0]);
    return rows[0];
  });
}

async function listMessages(disputeId, { includeInternal = false } = {}) {
  return query(
    `SELECT m.*, u.full_name AS author_name, u.avatar AS author_avatar
     FROM dispute_messages m JOIN users u ON m.author_id = u.id
     WHERE m.dispute_id = ?
       ${includeInternal ? '' : 'AND m.is_internal = 0'}
     ORDER BY m.created_at ASC`,
    [disputeId]
  );
}

// ---- Evidence (file uploads) ----
async function addEvidence({ dispute_id, uploaded_by, file_url, file_name, file_type, file_size, kind = 'file', caption = null }) {
  const result = await query(
    `INSERT INTO dispute_evidence
      (dispute_id, uploaded_by, file_url, file_name, file_type, file_size, kind, caption)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [dispute_id, uploaded_by, file_url, file_name, file_type, file_size, kind, caption]
  );
  return queryOne('SELECT * FROM dispute_evidence WHERE id = ?', [result.insertId]);
}

async function listEvidence(disputeId) {
  return query(
    `SELECT e.*, u.full_name AS uploaded_by_name
     FROM dispute_evidence e JOIN users u ON e.uploaded_by = u.id
     WHERE e.dispute_id = ?
     ORDER BY e.created_at ASC`,
    [disputeId]
  );
}

module.exports = {
  open, findById, list, assign, resolve, close,
  logAccess, getAccessLogs, findActiveForConversation, findActiveForRequest,
  changeStatus, setRatingsAllowed, setFrozen, setChatLocked, getStatusLogs,
  postMessage, listMessages, addEvidence, listEvidence, assertWritable,
  TERMINAL,
};
