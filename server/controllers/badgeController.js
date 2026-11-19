const badgeService = require('../services/badgeService');
const ProviderBadge = require('../models/ProviderBadge');
const { success, created, error, notFound, paginate, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { validId, invalid } = require('../models/Payment');
function financeHandler(handler) {
  return asyncHandler(async (req, res) => {
    if (req.params?.id !== undefined && !validId(req.params.id)) throw invalid('Invalid badge ID');
    return handler(req, res);
  });
}

// --- Public-ish (auth required) ---

// Current fee / insurance policy + the calling user's badges
const myBadges = financeHandler(async (req, res) => {
  await badgeService.sweep();
  const config = await badgeService.getConfig();
  const badges = await ProviderBadge.listForUser(req.user.id);
  return success(res, { config, badges });
});

const requestBadge = financeHandler(async (req, res) => {
  if (req.user.role !== 'provider') return forbidden(res, req.t('forbidden'));
  const { badge_type, notes } = req.body;
  const result = await badgeService.request({ user: req.user, badge_type, notes });
  if (!result.ok) {
    if (result.error === 'disabled')          return error(res, req.t('badges_disabled'), 403);
    if (result.error === 'invalid_type')      return error(res, req.t('invalid_data'), 400);
    if (result.error === 'already_in_flight') return error(res, req.t('badge_already_in_flight'), 409);
    if (result.error === 'invalid_data') return error(res, req.t('invalid_data'), 400);
    return error(res, result.error);
  }
  return created(res, result.badge, req.t('badge_requested'));
});

const payBadge = financeHandler(async (req, res) => {
  const result = await badgeService.pay({ user: req.user, badgeId: Number(req.params.id) });
  if (!result.ok) {
    if (result.error === 'payment_not_configured') return error(res, result.message, 503);
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'forbidden')   return forbidden(res);
    if (result.error === 'wrong_state') return error(res, req.t('badge_not_approved_yet'), 409);
    return error(res, result.error);
  }
  return success(res, result.badge, req.t('badge_activated'));
});

const cancelBadge = financeHandler(async (req, res) => {
  const result = await badgeService.cancel({ user: req.user, badgeId: Number(req.params.id) });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'forbidden')   return forbidden(res);
    if (result.error === 'wrong_state') return error(res, req.t('cannot_cancel_now'), 409);
    return error(res, result.error);
  }
  return success(res, result.badge, req.t('cancelled'));
});

// --- Admin endpoints ---

const adminList = financeHandler(async (req, res) => {
  await badgeService.sweep();
  const { status, badge_type, page = 1, limit = 20 } = req.query;
  const { items, total } = await ProviderBadge.listPaginated({ status, badge_type, page, limit });
  return paginate(res, items, total, page, limit);
});

const adminApprove = financeHandler(async (req, res) => {
  const result = await badgeService.approve({ badgeId: Number(req.params.id), adminId: req.user.id });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'wrong_state') return error(res, req.t('badge_wrong_state'), 409);
    return error(res, result.error);
  }
  return success(res, result.badge, req.t('badge_approved'));
});

const adminReject = financeHandler(async (req, res) => {
  const { reason } = req.body || {};
  const result = await badgeService.reject({
    badgeId: Number(req.params.id), adminId: req.user.id, reason,
  });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'wrong_state') return error(res, req.t('badge_wrong_state'), 409);
    return error(res, result.error);
  }
  return success(res, result.badge, req.t('badge_rejected'));
});

module.exports = {
  myBadges, requestBadge, payBadge, cancelBadge,
  adminList, adminApprove, adminReject,
};
