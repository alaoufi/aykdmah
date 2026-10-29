const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { query, queryOne } = require('../config/database');
const notificationService = require('../services/notificationService');
const { success, created, error, notFound, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { emitConversation } = require('../utils/conversationEvents');
const { validateChatMessage, recordingDuration } = require('../utils/chatMessageValidation');

const listConversations = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const items = await Conversation.listForUser(req.user.id, { page, limit });
  return success(res, items);
});

const createConversation = asyncHandler(async (req, res) => {
  const { user_id, request_id } = req.body;
  if (!user_id) return error(res, req.t('user_id_required'));
  if (Number(user_id) === Number(req.user.id)) return error(res, req.t('cannot_chat_self'));
  const convId = await Conversation.findOrCreateBetween(req.user.id, user_id, request_id || null);
  return created(res, { id: convId });
});

const getMessages = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res);

  const { before, limit = 50 } = req.query;
  const messages = await Message.listByConversation(conversationId, { beforeId: before, limit });
  return success(res, messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res);

  const { content, message_type = 'text', reply_to_id, latitude, longitude, accuracy_m } = req.body;
  if (!await Conversation.canSend(conversationId, req.user.id)) return forbidden(res);
  const isLocation = message_type === 'location' && latitude != null && longitude != null;
  if (!content && !(req.files || []).length && !isLocation) return error(res, req.t('message_empty'));

  let duration;
  try {
    validateChatMessage({ content, message_type, files: req.files || [] });
    duration = recordingDuration(req.body.duration_seconds, req.files || []);
  } catch (_) { return error(res, req.t('invalid_data')); }

  // "To everyone" (AYK-043): the requester sends one message to every provider they
  // are talking with about this request, instead of repeating it in each chat.
  const targets = [Number(conversationId)];
  if (String(req.body.broadcast) === '1') {
    const conversation = await Conversation.findById(conversationId);
    const request = conversation?.request_id ? await queryOne('SELECT client_id FROM requests WHERE id = ? AND deleted_at IS NULL', [conversation.request_id]) : null;
    if (request && Number(request.client_id) === Number(req.user.id)) {
      const others = await query(`SELECT c.id FROM conversations c JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
        WHERE c.request_id = ? AND c.id <> ? ORDER BY c.id`, [req.user.id, conversation.request_id, conversationId]);
      for (const other of others) if (await Conversation.canSend(other.id, req.user.id)) targets.push(Number(other.id));
    }
  }

  const messageIds = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'chat', scopeId: conversationId }, async files => {
    const ids = [];
    for (const target of targets) {
      ids.push(await Message.create({
        conversation_id: target,
        sender_id: req.user.id,
        content,
        message_type,
        reply_to_id: target === Number(conversationId) ? reply_to_id || null : null,
        files: duration == null ? files : files.map(file => ({ ...file, duration_seconds: duration })),
        latitude: isLocation ? Number(latitude) : null,
        longitude: isLocation ? Number(longitude) : null,
        accuracy_m: isLocation && accuracy_m ? Number(accuracy_m) : null,
      }));
    }
    return ids;
  });
  const io = req.app.get('io');
  let message = null;
  for (const [index, target] of targets.entries()) {
    const sent = await Message.findById(messageIds[index]);
    if (index === 0) message = sent;
    await emitConversation(io, target, 'chat:message', sent);
    await notifyParticipants(req, target, { content, isLocation });
  }
  return created(res, { ...message, broadcast_count: targets.length });
});

async function notifyParticipants(req, conversationId, { content, isLocation }) {
  const participants = await Conversation.getParticipants(conversationId);
  for (const p of participants) {
    if (p.id !== req.user.id) {
      const bodyPreview = isLocation ? '📍'
        : content ? content.slice(0, 80) : req.t('notif_new_attachment');
      await notificationService.notifyUser(p.id, {
        type: 'new_message',
        title: req.user.full_name || req.t('notif_new_message_title'),
        body: bodyPreview,
        data: {
          system_title: req.user.full_name ? null : 'new_message',
          system_body: !isLocation && !content ? 'new_attachment' : null,
        },
        link: `/chat/${conversationId}`,
      });
    }
  }
}

const deleteMessage = asyncHandler(async (req, res) => {
  const messageId = req.params.messageId;
  const row = await Message.getSenderId(messageId);
  if (!row) return notFound(res);
  if (Number(row.sender_id) !== Number(req.user.id) || Number(row.conversation_id) !== Number(req.params.id)
      || !await Conversation.isParticipant(row.conversation_id, req.user.id)) return forbidden(res);
  await Message.softDelete(messageId);
  const io = req.app.get('io');
  await emitConversation(io, row.conversation_id, 'chat:deleted', {
    conversationId: row.conversation_id, messageId: Number(messageId),
  });
  return success(res, null, req.t('deleted'));
});

const searchMessages = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res);
  const q = (req.query.q || '').trim();
  if (!q) return success(res, []);
  const items = await Message.searchInConversation(conversationId, q, { limit: 30 });
  return success(res, items);
});

const markRead = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res);
  await Conversation.updateLastRead(conversationId, req.user.id);
  const io = req.app.get('io');
  await emitConversation(io, conversationId, 'chat:read', { conversationId, userId: req.user.id });
  return success(res, null, req.t('read_marked'));
});

const getConversation = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res);
  const conv = await Conversation.findById(conversationId);
  if (!conv) return notFound(res);
  const participants = await Conversation.getParticipants(conversationId);
  return success(res, { ...conv, participants });
});

module.exports = {
  listConversations, createConversation, getMessages, sendMessage, markRead,
  getConversation, deleteMessage, searchMessages,
};
