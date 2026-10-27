const Request = require('../models/Request');
const Conversation = require('../models/Conversation');
const notificationService = require('../services/notificationService');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { withUploadedFiles } = require('../utils/uploadPersistence');
const { hasPermission } = require('../middleware/roleCheck');

const privateAccess = (user, request) => user && (user.id === request.client_id
  || user.id === request.assigned_provider_id || hasPermission(user, 'requests.manage'));
const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value) && Number(value) <= 2147483647;

const create = asyncHandler(async (req, res) => {
  if (req.user.role !== 'client') return forbidden(res);
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
  return created(res, request, req.t('request_created'));
});

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
  });
  return paginate(res, items.map(Request.publicView), total, page, limit);
});

const getOne = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res);
  const allowed = privateAccess(req.user, request);
  if (!allowed && request.status !== 'open') return notFound(res);
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

module.exports = { create, getMy, getNearby, getOne, updateStatus, remove, startChat };
