const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { query, queryOne } = require('../config/database');
const notificationService = require('../services/notificationService');
const pushService = require('../services/pushService');
const fcmService = require('../services/fcmService');
const { translate: i18nText } = require('../utils/i18n');
const logger = require('../utils/logger');
const { success, created, error, notFound, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { emitConversation } = require('../utils/conversationEvents');
const { validateChatMessage, recordingDuration } = require('../utils/chatMessageValidation');

const unreadCount = asyncHandler(async (req, res) => success(res, { count: await Conversation.unreadTotal(req.user.id) }));

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
  if (!isParticipant) return forbidden(res, req.t('deny_chat_participant'));

  const { before, limit = 50 } = req.query;
  const messages = await Message.listByConversation(conversationId, { beforeId: before, limit });
  return success(res, messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res, req.t('deny_chat_participant'));

  const { content, message_type = 'text', reply_to_id, latitude, longitude, accuracy_m } = req.body;
  if (!await Conversation.canSend(conversationId, req.user.id)) return forbidden(res, req.t('deny_chat_closed'));
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
    pretranslate(sent).catch(err => logger.warn('Pre-translation failed:', err.message));
    await emitConversation(io, target, 'chat:message', sent);
    await notifyParticipants(req, target, { content, isLocation });
    deliverIfOnline(io, target, req.user.id).catch(() => {});
  }
  return created(res, { ...message, broadcast_count: targets.length });
});

// POST /chat/conversations/:id/messages/:messageId/forward { conversation_id? } (AYK-043)
// After sending, the requester forwards their own message (a voice note, a video,
// text) to every provider they are talking with about this request, or to one.
const forwardMessage = asyncHandler(async (req, res) => {
  if (!/^[1-9][0-9]{0,9}$/.test(req.params.messageId) || !/^[1-9][0-9]{0,9}$/.test(req.params.id)) return notFound(res);
  const message = await Message.findById(req.params.messageId);
  if (!message || message.deleted_at || Number(message.conversation_id) !== Number(req.params.id)
      || Number(message.sender_id) !== Number(req.user.id)) return notFound(res);
  const conversation = await Conversation.findById(req.params.id);
  const request = conversation?.request_id ? await queryOne('SELECT client_id FROM requests WHERE id = ? AND deleted_at IS NULL', [conversation.request_id]) : null;
  if (!request || Number(request.client_id) !== Number(req.user.id)) return forbidden(res, req.t('deny_request_owner'));
  const others = await query(`SELECT c.id FROM conversations c JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
    WHERE c.request_id = ? AND c.id <> ? ORDER BY c.id`, [req.user.id, conversation.request_id, conversation.id]);
  const wanted = req.body?.conversation_id == null ? null : Number(req.body.conversation_id);
  const targets = [];
  for (const other of others) {
    if (wanted !== null && Number(other.id) !== wanted) continue;
    if (await Conversation.canSend(other.id, req.user.id)) targets.push(Number(other.id));
  }
  if (wanted !== null && !targets.length) return forbidden(res, req.t('deny_chat_closed'));
  const files = (message.files || []).map(file => ({ file_url: file.file_url, file_name: file.file_name,
    file_type: file.file_type, file_size: file.file_size, duration_seconds: file.duration_seconds }));
  const io = req.app.get('io');
  for (const target of targets) {
    const id = await Message.create({ conversation_id: target, sender_id: req.user.id, content: message.content,
      message_type: message.message_type, files, latitude: message.latitude, longitude: message.longitude, accuracy_m: message.accuracy_m });
    const forwarded = await Message.findById(id);
    pretranslate(forwarded).catch(err => logger.warn('Pre-translation failed:', err.message));
    await emitConversation(io, target, 'chat:message', forwarded);
    await notifyParticipants(req, target, { content: message.content, isLocation: message.message_type === 'location' });
    deliverIfOnline(io, target, req.user.id).catch(() => {});
  }
  return success(res, { count: targets.length });
});

// GET /chat/conversations/:id/messages/:messageId/translation?lang=xx (AYK-044)
// Each message is shown in the reader's own language automatically.
// One translation per message and language, shared by every request for it: a request that
// arrives while the translation is on its way waits for that one instead of asking again.
const translations = new Map();
function translationFor(message, lang) {
  const key = `${message.id}:${lang}`;
  if (!translations.has(key)) {
    const { translate } = require('../services/translationService');
    const pending = translate(String(message.content).slice(0, 2000), null, lang)
      .catch(() => { translations.delete(key); return { text: message.content, provider: 'noop' }; })
      .then(result => ({ text: result.text, from: result.from || null, same: result.provider === 'noop' || result.text === message.content }));
    if (translations.size > 5000) translations.delete(translations.keys().next().value);
    translations.set(key, pending);
  }
  return translations.get(key);
}

// Translated as soon as it is sent, into each reader's language (the language of their
// devices), so the bubble shows the translation at once (AYK-119).
async function pretranslate(message) {
  if (!message?.content || message.message_type === 'location' || message.message_type === 'system') return;
  const { SUPPORTED, worthTranslating, detectLanguageFallback } = require('../services/translationService');
  if (!worthTranslating(message.content)) return;
  // The reader's screen skips a message whose script only their own language uses; so does this.
  const script = await detectLanguageFallback(message.content);
  const unique = ['ar', 'ur', 'bn', 'ml', 'am'].includes(script) ? script : null;
  const rows = await query(`SELECT DISTINCT ps.lang FROM push_subscriptions ps
    JOIN conversation_participants cp ON cp.user_id = ps.user_id
    WHERE cp.conversation_id = ? AND cp.user_id <> ?`, [message.conversation_id, message.sender_id]);
  for (const lang of new Set(rows.map(row => row.lang).filter(lang => SUPPORTED.includes(lang) && lang !== unique))) translationFor(message, lang);
}

const translateMessage = asyncHandler(async (req, res) => {
  if (!/^[1-9][0-9]{0,9}$/.test(req.params.messageId) || !/^[1-9][0-9]{0,9}$/.test(req.params.id)) return notFound(res);
  if (!await Conversation.isParticipant(req.params.id, req.user.id)) return forbidden(res, req.t('deny_chat_participant'));
  const message = await Message.findById(req.params.messageId);
  if (!message || Number(message.conversation_id) !== Number(req.params.id) || !message.content) return notFound(res);
  const { SUPPORTED } = require('../services/translationService');
  const lang = SUPPORTED.includes(req.query.lang) ? req.query.lang : 'ar';
  return success(res, await translationFor(message, lang));
});

// The other side's app is open somewhere: the message reached their phone (grey ✓✓, AYK-122).
async function deliverIfOnline(io, conversationId, senderId) {
  if (!io) return;
  for (const p of await Conversation.getParticipants(conversationId)) {
    if (Number(p.id) === Number(senderId)) continue;
    if ((await io.in(`user:${p.id}`).fetchSockets()).length) await Message.markDelivered(io, p.id, conversationId);
  }
}

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
      // The phone notification, also when the site is closed. One per conversation:
      // a newer message replaces the older one instead of piling up.
      pushService.sendToUser(p.id, lang => ({
        kind: 'message', tag: `chat-${conversationId}`, url: `/chat/${conversationId}`,
        title: req.user.full_name ? `${req.user.full_name}${req.user.referral_code ? ` (${req.user.referral_code})` : ''}` : i18nText(lang, 'notif_new_message_title'),
        body: isLocation ? '📍' : content ? content.slice(0, 80) : i18nText(lang, 'notif_new_attachment'),
      }), { TTL: 24 * 60 * 60, urgency: 'high' })
        .then(sent => logger.info(`Push message conversation=${conversationId} user=${p.id} devices=${sent}`))
        .catch(err => logger.warn('Message push failed:', err.message));
      // The Android app (AYK-122): Firebase reaches it even when it is closed.
      fcmService.sendToUser(p.id, {
        kind: 'message', tag: `chat-${conversationId}`, url: `/chat/${conversationId}`,
        title: req.user.full_name ? `${req.user.full_name}${req.user.referral_code ? ` (${req.user.referral_code})` : ''}` : i18nText('ar', 'notif_new_message_title'),
        body: isLocation ? '📍' : content ? content.slice(0, 120) : i18nText('ar', 'notif_new_attachment'),
      }, { ttlSeconds: 24 * 60 * 60 })
        .then(sent => { if (sent) logger.info(`FCM message conversation=${conversationId} user=${p.id} devices=${sent}`); })
        .catch(err => logger.warn('FCM message failed:', err.message));
    }
  }
}

// "🔔 Remind" (AYK-052): alerts the other side again about my last message while it is
// unread, like a second ring. At most once a minute per conversation and sender.
const nudges = new Map();
const nudge = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!await Conversation.isParticipant(conversationId, req.user.id)) return forbidden(res, req.t('deny_chat_participant'));
  if (!await Conversation.canSend(conversationId, req.user.id)) return forbidden(res, req.t('deny_chat_closed'));
  const key = `${conversationId}:${req.user.id}`;
  if (Date.now() - (nudges.get(key) || 0) < 60000) return error(res, req.t('chat_nudge_wait'), 429);
  const last = await queryOne(`SELECT content, message_type FROM messages
    WHERE conversation_id = ? AND sender_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, [conversationId, req.user.id]);
  if (!last) return error(res, req.t('chat_nudge_nothing'), 400);
  nudges.set(key, Date.now());
  if (nudges.size > 10000) nudges.delete(nudges.keys().next().value);
  await notifyParticipants(req, conversationId, {
    content: `🔔 ${last.content ? last.content.slice(0, 70) : ''}`.trim(), isLocation: false,
  });
  // Say whether it reached them now (AYK-107): the site open somewhere, or a device registered
  // for notifications (browser or app). Otherwise they see it when they next open the app.
  const peer = (await Conversation.getParticipants(conversationId)).find(p => Number(p.id) !== Number(req.user.id));
  const io = req.app.get('io');
  const online = peer && io ? (await io.in(`user:${peer.id}`).fetchSockets()).length > 0 : false;
  const devices = peer ? (await require('../models/PushSubscription').listForUser(peer.id)).length + await require('../services/fcmService').countForUser(peer.id) : 0;
  return success(res, { nudged: true, reached: online || devices > 0 });
});

const deleteMessage = asyncHandler(async (req, res) => {
  const messageId = req.params.messageId;
  const row = await Message.getSenderId(messageId);
  if (!row) return notFound(res);
  if (Number(row.sender_id) !== Number(req.user.id) || Number(row.conversation_id) !== Number(req.params.id)
      || !await Conversation.isParticipant(row.conversation_id, req.user.id)) return forbidden(res, req.t('deny_own_message'));
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
  if (!isParticipant) return forbidden(res, req.t('deny_chat_participant'));
  const q = (req.query.q || '').trim();
  if (!q) return success(res, []);
  const items = await Message.searchInConversation(conversationId, q, { limit: 30 });
  return success(res, items);
});

const markRead = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res, req.t('deny_chat_participant'));
  await Conversation.updateLastRead(conversationId, req.user.id);
  const io = req.app.get('io');
  await emitConversation(io, conversationId, 'chat:read', { conversationId, userId: req.user.id });
  return success(res, null, req.t('read_marked'));
});

const getConversation = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const isParticipant = await Conversation.isParticipant(conversationId, req.user.id);
  if (!isParticipant) return forbidden(res, req.t('deny_chat_participant'));
  const conv = await Conversation.findById(conversationId);
  if (!conv) return notFound(res);
  const participants = await Conversation.getParticipants(conversationId);
  // Whether I blocked the other side (AYK-084), for the "Block" / "Unblock" button.
  const peer = participants.find(p => Number(p.id) !== Number(req.user.id));
  const direction = peer ? await require('./userBlockController').blockDirection(req.user.id, peer.id) : null;
  const saved = peer ? await queryOne('SELECT nickname FROM saved_providers WHERE user_id = ? AND provider_id = ?', [req.user.id, peer.id]) : null;
  // Why it cannot be written to, in words (AYK-112).
  let closedReason = null;
  if (!conv.can_send && !direction && conv.request_id) {
    const reqRow = await queryOne('SELECT client_id, status, assigned_provider_id FROM requests WHERE id = ?', [conv.request_id]);
    const providerId = reqRow && peer ? (Number(reqRow.client_id) === Number(req.user.id) ? peer.id : req.user.id) : null;
    const offer = providerId ? await queryOne('SELECT status FROM offers WHERE request_id = ? AND provider_id = ?', [conv.request_id, providerId]) : null;
    if (reqRow && ['completed', 'closed', 'cancelled'].includes(reqRow.status)) closedReason = 'finished';
    else if (reqRow?.assigned_provider_id && Number(reqRow.assigned_provider_id) !== Number(providerId)) closedReason = 'other_provider';
    else if (offer?.status === 'rejected') closedReason = 'declined';
  }
  return success(res, { ...conv, participants, blocked_by_me: direction === 'mine', blocked_me: direction === 'theirs', in_directory: Boolean(saved), directory_name: saved?.nickname || null, closed_reason: closedReason });
});

module.exports = {
  listConversations, unreadCount, forwardMessage, translateMessage, createConversation, getMessages, sendMessage, markRead,
  getConversation, deleteMessage, searchMessages, nudge };
