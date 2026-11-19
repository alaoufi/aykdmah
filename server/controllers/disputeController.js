const Dispute = require('../models/Dispute');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const LocationShare = require('../models/LocationShare');
const Request = require('../models/Request');
const notificationService = require('../services/notificationService');
const { query, queryOne, transaction } = require('../config/database');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { hasPermission } = require('../middleware/roleCheck');

const isDisputeAdmin = user => hasPermission(user, 'disputes.manage');

const STATUS_FLOW = ['open', 'under_review', 'waiting_response', 'escalated', 'resolved', 'rejected', 'closed'];

function roleOnRequest(user, request) {
  if (isDisputeAdmin(user)) return 'admin';
  if (request && request.client_id === user.id) return 'client';
  if (request && request.assigned_provider_id === user.id) return 'provider';
  return null;
}

async function notifyParties(dispute, payload) {
  const targets = new Set();
  if (dispute.request_id) {
    const r = await Request.findById(dispute.request_id);
    if (r?.client_id) targets.add(r.client_id);
    if (r?.assigned_provider_id) targets.add(r.assigned_provider_id);
  }
  for (const uid of targets) await notificationService.notifyUser(uid, payload);
}

// POST /disputes  (user opens a dispute on an order)
const openDispute = asyncHandler(async (req, res) => {
  const { request_id, subject, description } = req.body;
  if (!request_id || !subject) return error(res, req.t('invalid_data'));
  const request = await Request.findById(request_id);
  if (!request) return notFound(res, req.t('request_not_found'));
  const isOwner = request.client_id === req.user.id || request.assigned_provider_id === req.user.id;
  if (!isOwner && !isDisputeAdmin(req.user)) return forbidden(res);

  const id = await Dispute.open({
    request_id,
    opened_by: req.user.id,
    subject, description,
  });
  const dispute = await Dispute.findById(id);
  await notifyParties(dispute, {
    type: 'dispute_opened',
    title: req.t('dispute_opened_title'),
    body: subject,
    link: `/disputes/${id}`,
  });
  return created(res, dispute, req.t('updated'));
});

// GET /disputes (admin lists all; user lists their own)
const listDisputes = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  if (status && !STATUS_FLOW.includes(status)) return error(res, req.t('invalid_status'), 422);
  if (isDisputeAdmin(req.user)) {
    const { items, total } = await Dispute.list({ status, page, limit });
    return paginate(res, items, total, page, limit);
  }
  // Both current order parties can read their dispute.
  const offset = (page - 1) * limit;
  const where = ['r.deleted_at IS NULL', '(r.client_id = ? OR r.assigned_provider_id = ?)'];
  const params = [req.user.id, req.user.id];
  if (status) { where.push('d.status = ?'); params.push(status); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const items = await query(
    `SELECT d.*, r.title AS request_title FROM disputes d
     LEFT JOIN requests r ON d.request_id = r.id
     ${whereSql}
     ORDER BY d.opened_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM disputes d LEFT JOIN requests r ON d.request_id = r.id ${whereSql}`, params
  );
  return paginate(res, items, total, page, limit);
});

// GET /disputes/:id
const getDispute = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  const isAdmin = isDisputeAdmin(req.user);
  const request = dispute.request_id ? await Request.findById(dispute.request_id) : null;
  const isParty = request && [request.client_id, request.assigned_provider_id].includes(req.user.id);
  if (!isAdmin && !isParty) return forbidden(res);
  return success(res, dispute);
});

// POST /disputes/:id/access (admin requests chat access — must provide reason)
const requestChatAccess = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const { reason } = req.body;
  if (!hasPermission(req.user, 'conversations.read')) return forbidden(res);
  if (typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 255 || reason.includes('\0')) return error(res, req.t('invalid_data'), 422);

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  if (!['open', 'under_review'].includes(dispute.status)) {
    return error(res, req.t('forbidden'));
  }

  if (!dispute.assigned_admin_id) await Dispute.assign(dispute.id, req.user.id);

  await Dispute.logAccess({
    dispute_id: dispute.id,
    admin_id: req.user.id,
    conversation_id: dispute.conversation_id,
    order_id: dispute.request_id,
    action: 'chat_view',
    reason,
    ip_address: req.ip || req.connection?.remoteAddress || null,
  });
  return success(res, { granted: true, conversation_id: dispute.conversation_id });
});

// GET /disputes/:id/conversation (admin reads the chat after access logged)
const getDisputeConversation = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  if (!hasPermission(req.user, 'conversations.read')) return forbidden(res);
  if (!dispute.conversation_id) return notFound(res);
  if (!['open', 'under_review'].includes(dispute.status)) return forbidden(res);
  const grant = await queryOne(`SELECT reason FROM dispute_access_logs
    WHERE dispute_id = ? AND admin_id = ? AND conversation_id = ? AND action = 'chat_view'
      AND opened_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' ORDER BY id DESC LIMIT 1`,
    [dispute.id, req.user.id, dispute.conversation_id]);
  if (!grant) return forbidden(res);
  const request = dispute.request_id ? await Request.findById(dispute.request_id) : null;
  if (!request || !request.assigned_provider_id) return notFound(res);
  const participantIds = (await Conversation.getParticipants(dispute.conversation_id)).map(p => p.id);
  if (participantIds.length !== 2 || !participantIds.includes(request.client_id) || !participantIds.includes(request.assigned_provider_id)) return forbidden(res);

  const conv = await Conversation.findById(dispute.conversation_id);
  const participants = await Conversation.getParticipants(dispute.conversation_id);
  const messages = await Message.listByConversation(dispute.conversation_id, { limit: 500, includeDeleted: true });
  const locations = await LocationShare.getLatestForConversation(dispute.conversation_id);

  await Dispute.logAccess({
    dispute_id: dispute.id,
    admin_id: req.user.id,
    conversation_id: dispute.conversation_id,
    order_id: dispute.request_id,
    action: 'fetch_messages',
    reason: grant.reason,
    ip_address: req.ip || null,
  });

  return success(res, { conversation: conv, participants, messages, locations });
});

// GET /disputes/:id/access-logs
const getAccessLogs = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const logs = await Dispute.getAccessLogs(req.params.id);
  return success(res, logs);
});

// PUT /disputes/:id/resolve
const resolveDispute = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const { resolution, ratings_allowed = 'both' } = req.body;
  if (typeof resolution !== 'string' || !resolution.trim() || resolution.length > 10000
      || !['both','client_only','provider_only','none'].includes(ratings_allowed)) return error(res, req.t('invalid_data'), 422);
  await Dispute.resolve(req.params.id, resolution, {
    changedBy: req.user.id, role: 'admin', note: resolution.slice(0, 500), ratingsAllowed: ratings_allowed,
  });
  await Dispute.logAccess({
    dispute_id: req.params.id, admin_id: req.user.id,
    action: 'resolve', reason: resolution.slice(0, 255), ip_address: req.ip || null,
  });
  const dispute = await Dispute.findById(req.params.id);
  await notifyParties(dispute, {
    type: 'dispute_resolved',
    title: req.t('dispute_resolved_title'),
    body: resolution || dispute.subject,
    link: `/disputes/${req.params.id}`,
  });
  return success(res, dispute, req.t('updated'));
});

// PUT /disputes/:id/close
const closeDispute = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const dispute = await Dispute.close(req.params.id, { changedBy: req.user.id, role: 'admin' });
  return success(res, dispute, req.t('updated'));
});

// PUT /disputes/:id/status — admin moves through the workflow
const changeStatus = asyncHandler(async (req, res) => {
  if (!isDisputeAdmin(req.user)) return forbidden(res);
  const { status, note, frozen, chat_locked } = req.body;
  if (!STATUS_FLOW.includes(status)) return error(res, req.t('invalid_status'));
  await Dispute.changeStatus(req.params.id, status, {
    changedBy: req.user.id, role: 'admin', note, frozen, chatLocked: chat_locked,
  });
  const dispute = await Dispute.findById(req.params.id);
  await notifyParties(dispute, {
    type: 'dispute_status',
    title: req.t('dispute_status_changed'),
    body: `${status} — ${dispute.subject}`,
    link: `/disputes/${req.params.id}`,
  });
  return success(res, dispute, req.t('updated'));
});

// GET /disputes/:id/timeline — status logs + messages merged & sorted
const timeline = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  const isAdmin = isDisputeAdmin(req.user);
  const request = dispute.request_id ? await Request.findById(dispute.request_id) : null;
  const isParty = request && [request.client_id, request.assigned_provider_id].includes(req.user.id);
  if (!isAdmin && !isParty) return forbidden(res);

  const [statusLogs, messages, evidence] = await Promise.all([
    Dispute.getStatusLogs(req.params.id),
    Dispute.listMessages(req.params.id, { includeInternal: isAdmin }),
    Dispute.listEvidence(req.params.id),
  ]);
  return success(res, { dispute, statusLogs, messages, evidence });
});

// POST /disputes/:id/messages — parties or admin post clarifications
const postMessage = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  const request = dispute.request_id ? await Request.findById(dispute.request_id) : null;
  const role = roleOnRequest(req.user, request);
  if (!role && !isDisputeAdmin(req.user)) return forbidden(res);

  if (typeof req.body.body !== 'string' || req.body.body.length > 10000) return error(res, req.t('invalid_data'), 422);
  const body = req.body.body.trim();
  if (!body) return error(res, req.t('message_empty'));
  const is_internal = isDisputeAdmin(req.user) && req.body.internal === true;
  const msg = await Dispute.postMessage({
    dispute_id: req.params.id,
    author_id: req.user.id,
    author_role: isDisputeAdmin(req.user) ? 'admin' : role,
    body, is_internal,
  });
  if (!is_internal) {
    await notifyParties(dispute, {
      type: 'dispute_message',
      title: req.t('dispute_new_message'),
      body: body.slice(0, 80),
      link: `/disputes/${req.params.id}`,
    });
  }
  return created(res, msg);
});

// POST /disputes/:id/evidence — file upload (multipart 'files')
const uploadEvidence = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return notFound(res);
  const request = dispute.request_id ? await Request.findById(dispute.request_id) : null;
  const role = roleOnRequest(req.user, request);
  if (!role && !isDisputeAdmin(req.user)) return forbidden(res);
  if (req.body.caption != null && (typeof req.body.caption !== 'string' || req.body.caption.length > 300 || req.body.caption.includes('\0'))) return error(res, req.t('invalid_data'), 422);
  if (!req.files || !req.files.length) return error(res, req.t('invalid_data'));

  const uploaded = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'disputes', scopeId: req.params.id }, files => transaction(async conn => {
    await Dispute.assertWritable(conn, req.params.id, req.user);
    const evidenceRows = [];
    for (const file of files) {
      const kind = file.file_type.startsWith('image/') ? 'image'
        : file.file_type.startsWith('audio/') ? 'voice' : 'file';
      const [rows] = await conn.execute(
        `INSERT INTO dispute_evidence
          (dispute_id, uploaded_by, file_url, file_name, file_type, file_size, kind, caption)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, req.user.id, file.file_url, file.file_name, file.file_type, file.file_size, kind, req.body.caption || null]
      );
      evidenceRows.push(rows[0]);
    }
    return evidenceRows;
  }));
  return created(res, uploaded);
});

module.exports = {
  openDispute, listDisputes, getDispute,
  requestChatAccess, getDisputeConversation, getAccessLogs,
  changeStatus, timeline, postMessage, uploadEvidence,
  resolveDispute, closeDispute,
};
