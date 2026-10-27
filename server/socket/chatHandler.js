const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const LocationShare = require('../models/LocationShare');
const Request = require('../models/Request');
const { emitConversation } = require('../utils/conversationEvents');
const { assertMarketplaceWriteAccess } = require('../middleware/verificationPolicy');
const { consumeSocketWrite } = require('../utils/socketWriteLimiter');

function registerChatHandlers(io, socket) {
  socket.on('chat:join', async (conversationId, ack) => {
    try {
      const ok = await Conversation.isParticipant(conversationId, socket.user.id);
      if (!ok) return ack && ack({ ok: false, error: 'forbidden' });
      socket.join(`conv:${conversationId}`);
      return ack && ack({ ok: true });
    } catch (err) {
      return typeof ack === 'function' && ack({ ok: false, error: 'invalid_request' });
    }
  });

  socket.on('chat:leave', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
  });

  // Live location stream — emits to the conversation room + persists a tick
  socket.on('location:share', async (payload, ack) => {
    try {
      await assertMarketplaceWriteAccess(socket.user.id);
      const { conversationId, latitude, longitude, accuracy_m, heading, speed_kmh } = payload || {};
      if (!conversationId || latitude == null || longitude == null) {
        return ack && ack({ ok: false, error: 'missing' });
      }
      const ok = await Conversation.canShareLocation(conversationId, socket.user.id);
      if (!ok) return ack && ack({ ok: false, error: 'forbidden' });
      const lat = Number(latitude), lon = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180
          || (accuracy_m != null && (!Number.isSafeInteger(Number(accuracy_m)) || Number(accuracy_m) < 0 || Number(accuracy_m) > 100000))
          || (heading != null && (!Number.isFinite(Number(heading)) || Number(heading) < 0 || Number(heading) > 360))
          || (speed_kmh != null && (!Number.isFinite(Number(speed_kmh)) || Number(speed_kmh) < 0 || Number(speed_kmh) > 1000))) {
        return typeof ack === 'function' && ack({ ok: false, error: 'invalid_location' });
      }

      const conv = await Conversation.findById(conversationId);
      const request = conv && conv.request_id ? await Request.findById(conv.request_id) : null;
      const senderRole = socket.user.role === 'admin' ? 'admin'
        : request && request.assigned_provider_id === socket.user.id ? 'provider'
        : request && request.client_id === socket.user.id ? 'client'
        : (socket.user.role === 'provider' ? 'provider' : 'client');

      const allowance = await consumeSocketWrite(socket.user.id, 'location');
      if (!allowance.ok) return typeof ack === 'function' && ack(allowance);

      await LocationShare.create({
        conversation_id: conversationId,
        request_id: conv ? conv.request_id : null,
        user_id: socket.user.id,
        sender_role: senderRole,
        latitude, longitude,
        accuracy_m, heading, speed_kmh,
        is_live: 1,
        ttl_minutes: 30,
      });

      await emitConversation(io, conversationId, 'location:update', {
        conversationId: Number(conversationId),
        userId: socket.user.id,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy_m: accuracy_m ?? null,
        sender_role: senderRole,
        created_at: new Date().toISOString(),
      });
      return ack && ack({ ok: true });
    } catch (err) {
      return typeof ack === 'function' && ack({ ok: false, error: 'invalid_request' });
    }
  });

  socket.on('location:stop', async (payload, ack) => {
    try {
      const { conversationId } = payload || {};
      const ok = await Conversation.isParticipant(conversationId, socket.user.id);
      if (!ok) return ack && ack({ ok: false, error: 'forbidden' });
      await LocationShare.stopSharing(socket.user.id, conversationId);
      await emitConversation(io, conversationId, 'location:stop', {
        conversationId: Number(conversationId), userId: socket.user.id,
      });
      return ack && ack({ ok: true });
    } catch (err) {
      return typeof ack === 'function' && ack({ ok: false, error: 'invalid_request' });
    }
  });

  socket.on('chat:typing', async (payload) => {
    try {
      const { conversationId, isTyping } = payload || {};
      if (!await Conversation.canSend(conversationId, socket.user.id)) return;
      await emitConversation(io, conversationId, 'chat:typing', {
        conversationId, userId: socket.user.id, isTyping: !!isTyping,
      }, { excludeSocketId: socket.id });
    } catch (_) { /* Invalid packets do not disclose details or reject an unobserved promise. */ }
  });

  socket.on('chat:send', async (payload, ack) => {
    try {
      await assertMarketplaceWriteAccess(socket.user.id);
      const { conversationId, content, message_type = 'text', reply_to_id } = payload || {};
      if (!conversationId) return ack && ack({ ok: false, error: 'missing conversationId' });
      const ok = await Conversation.canSend(conversationId, socket.user.id);
      if (!ok) return ack && ack({ ok: false, error: 'forbidden' });
      if (!content) return ack && ack({ ok: false, error: 'empty' });

      const allowance = await consumeSocketWrite(socket.user.id, 'chat');
      if (!allowance.ok) return typeof ack === 'function' && ack(allowance);

      const messageId = await Message.create({
        conversation_id: conversationId,
        sender_id: socket.user.id,
        content, message_type, reply_to_id,
      });
      const message = await Message.findById(messageId);

      await emitConversation(io, conversationId, 'chat:message', message);
      return ack && ack({ ok: true, message });
    } catch (err) {
      return typeof ack === 'function' && ack({ ok: false, error: 'invalid_request' });
    }
  });

  socket.on('chat:read', async (payload, ack) => {
    try {
      const { conversationId } = payload || {};
      const ok = await Conversation.isParticipant(conversationId, socket.user.id);
      if (!ok) return ack && ack({ ok: false, error: 'forbidden' });
      await Conversation.updateLastRead(conversationId, socket.user.id);
      await emitConversation(io, conversationId, 'chat:read', { conversationId, userId: socket.user.id });
      return ack && ack({ ok: true });
    } catch (err) {
      return typeof ack === 'function' && ack({ ok: false, error: 'invalid_request' });
    }
  });
}

module.exports = registerChatHandlers;
