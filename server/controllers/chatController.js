const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
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

  const messageId = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'chat', scopeId: conversationId }, files => Message.create({
    conversation_id: conversationId,
    sender_id: req.user.id,
    content,
    message_type,
    reply_to_id: reply_to_id || null,
    files: duration == null ? files : files.map(file => ({ ...file, duration_seconds: duration })),
    latitude: isLocation ? Number(latitude) : null,
    longitude: isLocation ? Number(longitude) : null,
    accuracy_m: isLocation && accuracy_m ? Number(accuracy_m) : null,
  }));
  const message = await Message.findById(messageId);

  const participants = await Conversation.getParticipants(conversationId);
  const io = req.app.get('io');
  await emitConversation(io, conversationId, 'chat:message', message);
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
  return created(res, message);
});

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
