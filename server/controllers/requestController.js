const Request = require('../models/Request');
const Conversation = require('../models/Conversation');
const Offer = require('../models/Offer');
const { query, queryOne } = require('../config/database');
const notificationService = require('../services/notificationService');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { hasPermission } = require('../middleware/roleCheck');

const privateAccess = (user, request) => user && (user.id === request.client_id
  || user.id === request.assigned_provider_id || user.id === request.direct_provider_id || hasPermission(user, 'requests.manage'));
const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value) && Number(value) <= 2147483647;

const create = asyncHandler(async (req, res) => {
  // Admins may post requests too (the owner tests the site with the admin account).
  const canRequest = ['client', 'admin'].includes(req.user.role) || (req.user.role === 'provider' && Number(req.user.also_client) === 1);
  if (!canRequest) return forbidden(res, req.t('request_client_only'));
  const data = {
    client_id: req.user.id,
    category_id: req.body.category_id,
    service_id: req.body.service_id,
    title: req.body.title,
    description: req.body.description,
    city_id: req.body.city_id,
    district_id: req.body.district_id,
    address: req.body.address,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    country_id: req.body.country_id,
    region_id: req.body.region_id,
    governorate_id: req.body.governorate_id,
    remember_location: req.body.remember_location,
    budget_min: req.body.budget_min,
    budget_max: req.body.budget_max,
    preferred_date: req.body.preferred_date,
    is_urgent: req.body.is_urgent === true || req.body.is_urgent === 'true',
  };
  let id;
  try {
    id = await withUploadedFiles(req.files, { ownerId: req.user.id, scope: 'requests' }, files => Request.create({ ...data, files }));
  } catch (err) {
    if (err.message === 'account_location_required') err.message = req.t('account_location_required');
    throw err;
  }
  const request = await Request.findById(id);

  const io = req.app.get('io');
  if (io) io.emit('request:new_nearby', Request.publicView(request));
  await announceToProviders(req, request);
  return created(res, request, req.t('request_created'));
});

// Right after posting, providers of that profession covering the request's area who
// are working now are told, so they can contact the requester (AYK-041).
async function announceToProviders(req, request) {
  try {
    const ids = await require('./providerMapController').availableForRequest({
      districtId: request.district_id, cityId: request.city_id, categoryId: request.category_id,
      serviceId: request.service_id, excludeId: request.client_id,
    });
    await notificationService.broadcast(ids, {
      type: 'request_new',
      title: req.t('request_new_title'),
      body: req.t('request_new_body', { title: request.title }),
      link: `/requests/${request.id}`,
      data: { request_id: request.id },
    });
  } catch (_) { /* The request is posted; a failed notice must not undo it. */ }
}

const getMy = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const { items, total } = await Request.findByClient(req.user.id, { status, page, limit });
  return paginate(res, items, total, page, limit);
});

const getNearby = asyncHandler(async (req, res) => {
  const { latitude, longitude, radius, category_id, service_id, status } = req.query;
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const { items, total } = await Request.findNearby({
    latitude,
    longitude,
    radiusKm: radius === undefined ? 25 : radius,
    categoryId: category_id,
    serviceId: service_id,
    status: status || 'open',
    page, limit,
    providerId: req.query.matching === '1' && req.user?.role === 'provider' ? req.user.id : null,
  });
  return paginate(res, items.map(Request.publicView), total, page, limit);
});

const getOne = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  const allowed = privateAccess(req.user, request);
  if (!allowed && (request.status !== 'open' || request.direct_provider_id)) return notFound(res);
  await Request.incrementViews(req.params.id);
  return success(res, allowed ? request : Request.publicView(request));
});

const updateStatus = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);

  const isOwner = request.client_id === req.user.id;
  const isAssigned = request.assigned_provider_id === req.user.id;
  const isAdmin = hasPermission(req.user, 'requests.manage');
  if (!isOwner && !isAssigned && !isAdmin) return forbidden(res);

  const { status, cancellation_reason } = req.body;
  const allowed = ['in_progress', 'completed', 'cancelled', 'closed'];
  if (!allowed.includes(status)) return error(res, req.t('invalid_status'));

  const updated = await Request.updateStatus(req.params.id, status, { cancellation_reason, actor: req.user });

  if (status === 'completed' && updated.assigned_provider_id && updated.client_id) {
    await notificationService.notifyUser(updated.client_id, {
      type: 'request_completed',
      title: req.t('notif_request_completed_title'),
      body: `تم إكمال طلبك: ${updated.title}`,
      link: `/requests/${updated.id}`,
    });
  }
  return success(res, updated, req.t('status_updated'));
});

const setReminders = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const off = req.body?.off !== false;
  if (!(await Request.setRemindersOff(Number(req.params.id), req.user.id, off))) return notFound(res);
  return success(res, { reminders_off: off ? 1 : 0 }, off ? req.t('request_reminders_off') : undefined);
});

// Direct contact, no price: a provider contacts the requester, or the requester contacts
// a matching provider. Either way one conversation per pair is opened for this request.
const contact = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);
  const owner = request.client_id === req.user.id;
  const providerId = owner ? Number(req.body?.provider_id) : req.user.id;
  if (!owner && req.user.role !== 'provider') return forbidden(res);
  if (!Number.isSafeInteger(providerId) || providerId < 1) return error(res, req.t('invalid_data'));
  if (request.direct_provider_id && providerId !== Number(request.direct_provider_id)) return forbidden(res);
  // A provider starting the contact needs a subscription where one applies (AYK-042);
  // a requester contacting a provider is never stopped.
  if (!owner && await require('../services/subscriptionRules').blocks(providerId, { categoryId: request.category_id, cityId: request.city_id })) {
    return error(res, req.t('subscription_required'), 402);
  }
  await Offer.create({ request_id: request.id, provider_id: providerId, contact: true });
  const conversationId = await Conversation.findOrCreateBetween(request.client_id, providerId, request.id);
  await notificationService.notifyUser(owner ? providerId : request.client_id, {
    type: 'request_contact',
    title: req.t('request_contact_title'),
    body: req.t('request_contact_body', { name: req.user.full_name, title: request.title }),
    link: `/chat/${conversationId}`,
    data: { request_id: request.id, conversation_id: conversationId },
  });
  return success(res, { conversation_id: conversationId });
});

// "Agreed": the requester picks one provider; the request is assigned to them and the
// other conversations about this request become read-only.
const agree = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id) return forbidden(res);
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);
  const providerId = Number(req.body?.provider_id);
  if (!Number.isSafeInteger(providerId) || providerId < 1) return error(res, req.t('invalid_data'));
  let offer = await queryOne("SELECT id FROM offers WHERE request_id = ? AND provider_id = ? AND status = 'pending'", [request.id, providerId]);
  if (!offer) offer = { id: await Offer.create({ request_id: request.id, provider_id: providerId, contact: true }) };
  await Offer.acceptOffer(offer.id, req.user.id);
  await notificationService.notifyUser(providerId, {
    type: 'offer_accepted',
    title: req.t('notif_offer_accepted_title'),
    body: req.t('notif_offer_accepted_body', { title: request.title }),
    link: `/requests/${request.id}`,
  });
  const conversationId = await Conversation.findOrCreateBetween(req.user.id, providerId, request.id);
  return success(res, { conversation_id: conversationId }, req.t('offer_accepted'));
});

// POST /requests/direct { provider_id, category_id? } — the requester contacts a provider
// from their directory without posting to the board. It is still a request (counted
// in the statistics, archived, agreed and rated as usual), seen by that provider only.
const direct = asyncHandler(async (req, res) => {
  const canRequest = req.user.role === 'client' || (req.user.role === 'provider' && Number(req.user.also_client) === 1);
  if (!canRequest) return forbidden(res, req.t('request_client_only'));
  const providerId = Number(req.body?.provider_id);
  if (!Number.isSafeInteger(providerId) || providerId < 1 || providerId === req.user.id) return error(res, req.t('invalid_data'));
  const provider = await queryOne(`SELECT u.id, pp.category_id FROM users u JOIN provider_profiles pp ON pp.user_id = u.id
    WHERE u.id = ? AND u.role = 'provider' AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0`, [providerId]);
  if (!provider) return notFound(res);
  // An open direct contact with the same provider is reopened rather than duplicated.
  const existing = await queryOne(`SELECT id FROM requests WHERE client_id = ? AND direct_provider_id = ? AND deleted_at IS NULL
    AND status IN ('open', 'assigned', 'in_progress') ORDER BY id DESC LIMIT 1`, [req.user.id, providerId]);
  let requestId = existing?.id;
  if (!requestId) {
    const categoryId = req.body?.category_id || provider.category_id || null;
    try {
      requestId = await Request.create({ client_id: req.user.id, category_id: categoryId, title: req.body?.title, description: req.body?.description });
    } catch (err) {
      if (err.message === 'account_location_required') err.message = req.t('account_location_required');
      throw err;
    }
    await query('UPDATE requests SET direct_provider_id = ?, reminders_off = 1 WHERE id = ?', [providerId, requestId]);
    await Offer.create({ request_id: requestId, provider_id: providerId, contact: true });
  }
  const request = await Request.findById(requestId);
  const conversationId = await Conversation.findOrCreateBetween(req.user.id, providerId, requestId);
  if (!existing) {
    await notificationService.notifyUser(providerId, {
      type: 'request_contact',
      title: req.t('request_contact_title'),
      body: req.t('request_contact_body', { name: req.user.full_name, title: request.title }),
      link: `/chat/${conversationId}`,
      data: { request_id: requestId, conversation_id: conversationId },
    });
  }
  return success(res, { request_id: requestId, conversation_id: conversationId });
});

const remove = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id && !hasPermission(req.user, 'requests.manage')) return forbidden(res);
  await Request.softDelete(req.params.id, req.user);
  return success(res, null, req.t('request_deleted'));
});

const startChat = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);

  if (![request.client_id, request.assigned_provider_id].includes(req.user.id)) return forbidden(res);
  const otherUserId = req.user.id === request.client_id
    ? request.assigned_provider_id
    : request.client_id;
  if (!otherUserId) return error(res, req.t('chat_needs_two'));

  const convId = await Conversation.findOrCreateBetween(req.user.id, otherUserId, request.id);
  return success(res, { conversation_id: convId });
});

module.exports = { create, getMy, getNearby, getOne, updateStatus, setReminders, contact, agree, direct, remove, startChat };
