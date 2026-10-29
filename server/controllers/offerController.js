const Offer = require('../models/Offer');
const Request = require('../models/Request');
const Conversation = require('../models/Conversation');
const notificationService = require('../services/notificationService');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { hasPermission } = require('../middleware/roleCheck');

const create = asyncHandler(async (req, res) => {
  if (req.user.role !== 'provider') return forbidden(res, req.t('providers_only'));

  const {
    request_id, price, message, estimated_duration, available_from,
    latitude, longitude, location_accuracy,
  } = req.body;
  const request = await Request.findById(request_id);
  if (!request) return notFound(res, req.t('request_not_found'));
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);
  if (request.client_id === req.user.id) return forbidden(res, req.t('deny_own_request'));

  const offerId = await Offer.create({
    request_id, provider_id: req.user.id, price, message, estimated_duration, available_from,
    latitude, longitude, location_accuracy,
  });
  const offer = await Offer.findById(offerId);

  await notificationService.notifyUser(request.client_id, {
    type: 'new_offer',
    title: req.t('notif_new_offer_title'),
    body: req.t('notif_new_offer_body', { name: req.user.full_name, price }),
    link: `/requests/${request_id}`,
    data: { request_id, offer_id: offerId },
  });
  return created(res, offer, req.t('offer_sent'));
});

const getForRequest = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.requestId);
  if (!request) return notFound(res);
  const isOwner = request.client_id === req.user.id;
  const canViewAll = isOwner || hasPermission(req.user, 'requests.manage');
  if (!canViewAll && req.user.role !== 'provider') return forbidden(res, req.t('deny_providers_only'));
  const items = await Offer.findByRequest(req.params.requestId, canViewAll ? {} : { providerId: req.user.id });
  return success(res, items);
});

const getMy = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { items, total } = await Offer.findByProvider(req.user.id, { status, page, limit });
  return paginate(res, items, total, page, limit);
});

const accept = asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) return notFound(res);
  const request = await Request.findById(offer.request_id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id) return forbidden(res, req.t('deny_request_owner'));
  if (request.status !== 'open') return error(res, req.t('request_not_open'), 409);

  await Offer.acceptOffer(req.params.id, req.user.id);

  await notificationService.notifyUser(offer.provider_id, {
    type: 'offer_accepted',
    title: req.t('notif_offer_accepted_title'),
    body: req.t('notif_offer_accepted_body', { title: request.title }),
    link: `/requests/${request.id}`,
  });

  await Conversation.findOrCreateBetween(req.user.id, offer.provider_id, request.id);
  return success(res, null, req.t('offer_accepted'));
});

const reject = asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) return notFound(res);
  const request = await Request.findById(offer.request_id);
  if (!request) return notFound(res);
  if (request.client_id !== req.user.id) return forbidden(res, req.t('deny_request_owner'));

  const updated = await Offer.rejectOffer(req.params.id, req.user.id);
  await notificationService.notifyUser(offer.provider_id, {
    type: 'offer_rejected',
    title: req.t('notif_offer_rejected_title'),
    body: req.t('notif_offer_rejected_body'),
    link: `/requests/${request.id}`,
  });
  return success(res, updated, req.t('offer_rejected'));
});

module.exports = { create, getForRequest, getMy, accept, reject };
