const Conversation = require('../models/Conversation');
const LocationShare = require('../models/LocationShare');
const Request = require('../models/Request');
const Setting = require('../models/Setting');
const { success, error, forbidden, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { emitConversation } = require('../utils/conversationEvents');
const { hasPermission } = require('../middleware/roleCheck');

const SENDER_ROLE = { client: 'client', provider: 'provider', admin: 'admin' };

function inferRole(user, request) {
  if (user.role === 'admin') return SENDER_ROLE.admin;
  if (request && request.assigned_provider_id === user.id) return SENDER_ROLE.provider;
  if (request && request.client_id === user.id) return SENDER_ROLE.client;
  return user.role === 'provider' ? SENDER_ROLE.provider : SENDER_ROLE.client;
}

// POST /chat/:id/location
const shareInConversation = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const ok = await Conversation.canShareLocation(conversationId, req.user.id);
  if (!ok) return forbidden(res);

  const { latitude, longitude, accuracy_m, heading, speed_kmh, is_live = true } = req.body;
  if (latitude == null || longitude == null) return error(res, req.t('invalid_data'));
  if (![true, false, 0, 1].includes(is_live)) return error(res, req.t('invalid_data'), 422);

  const conv = await Conversation.findById(conversationId);
  const request = conv && conv.request_id ? await Request.findById(conv.request_id) : null;
  const role = inferRole(req.user, request);

  const ttlSetting = await Setting.get('location_share_ttl_minutes').catch(() => null);
  const ttlNumber = Number(ttlSetting);
  const ttl = Number.isSafeInteger(ttlNumber) && ttlNumber >= 1 && ttlNumber <= 1440 ? ttlNumber : 30;

  const point = await LocationShare.create({
    conversation_id: conversationId,
    request_id: conv ? conv.request_id : null,
    user_id: req.user.id,
    sender_role: role,
    latitude, longitude,
    accuracy_m: accuracy_m ?? null,
    heading: heading ?? null,
    speed_kmh: speed_kmh ?? null,
    is_live: is_live ? 1 : 0,
    ttl_minutes: ttl,
  });

  const io = req.app.get('io');
  if (io && point.is_live) {
    await emitConversation(io, conversationId, 'location:update', {
      conversationId: Number(conversationId),
      userId: req.user.id,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy_m: accuracy_m ?? null,
      sender_role: role,
      created_at: point.created_at,
    });
  } else if (io) {
    await emitConversation(io, conversationId, 'location:stop', { conversationId: Number(conversationId), userId: req.user.id });
  }
  return success(res, point);
});

// GET /chat/:id/location/latest
const getLatestForConversation = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const ok = await Conversation.isParticipant(conversationId, req.user.id);
  if (!ok) return forbidden(res);
  const items = await LocationShare.getLatestForConversation(conversationId);
  return success(res, items);
});

// DELETE /chat/:id/location
const stopSharing = asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const ok = await Conversation.isParticipant(conversationId, req.user.id);
  if (!ok) return forbidden(res);
  await LocationShare.stopSharing(req.user.id, conversationId);
  const io = req.app.get('io');
  if (io) await emitConversation(io, conversationId, 'location:stop', { conversationId: Number(conversationId), userId: req.user.id });
  return success(res, null, req.t('updated'));
});

// GET /requests/:id/tracking
const getRequestTracking = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res, req.t('request_not_found'));
  const allowed = hasPermission(req.user, 'requests.manage')
    || request.client_id === req.user.id
    || request.assigned_provider_id === req.user.id;
  if (!allowed) return forbidden(res);

  const conv = await require('../config/database').queryOne(
    `SELECT c.id FROM conversations c
      JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ?
      JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ?
      WHERE c.request_id = ? AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = c.id) = 2
      ORDER BY c.id LIMIT 1`,
    [request.client_id, request.assigned_provider_id, req.params.id]
  );
  const locations = conv
    ? await LocationShare.getLatestForConversation(conv.id)
    : [];
  return success(res, {
    request: {
      id: request.id,
      title: request.title,
      status: request.status,
      client_id: request.client_id,
      assigned_provider_id: request.assigned_provider_id,
      latitude: request.latitude,
      longitude: request.longitude,
      address: request.address,
    },
    conversation_id: conv ? conv.id : null,
    locations,
  });
});

module.exports = { shareInConversation, getLatestForConversation, stopSharing, getRequestTracking };
