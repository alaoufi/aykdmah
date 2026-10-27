const adRequestService = require('../services/adRequestService');
const Ad = require('../models/Ad');
const AdPlacementPricing = require('../models/AdPlacementPricing');
const ipGeo = require('../services/ipGeoService');
const { success, created, error, notFound, paginate, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { validId, invalid } = require('../models/Payment');
const { hasPermission } = require('../middleware/roleCheck');

function financeHandler(handler) {
  return asyncHandler(async (req, res) => {
    if (req.params?.id !== undefined && !validId(req.params.id)) throw invalid('Invalid advertisement ID');
    if (req.query?.placement !== undefined && !adRequestService.ALLOWED_PLACEMENTS.includes(req.query.placement)) throw invalid('Invalid placement');
    if (req.query?.days !== undefined && (!validId(req.query.days) || Number(req.query.days) > 60)) throw invalid('Invalid statistics window');
    return handler(req, res);
  });
}

function matchesGeo(ad, geo) {
  // No geo restriction set → always match.
  const countries = Array.isArray(ad.target_countries) ? ad.target_countries : [];
  const cities    = Array.isArray(ad.target_cities)    ? ad.target_cities    : [];
  const regions   = Array.isArray(ad.target_regions)   ? ad.target_regions   : [];
  if (countries.length === 0 && cities.length === 0 && regions.length === 0) return true;
  // A targeted placement needs a known matching location.
  if (!geo) return false;
  const cityMatch    = cities.length    > 0 && geo.city    && cities.some((c) => String(c).toLowerCase() === String(geo.city).toLowerCase());
  const countryMatch = countries.length > 0 && geo.country && countries.some((c) => String(c).toUpperCase() === String(geo.country).toUpperCase());
  const regionMatch  = regions.length   > 0 && geo.region_id && regions.some((r) => Number(r) === Number(geo.region_id));
  // Any axis match wins so an advertiser can mix region+country+city.
  return cityMatch || countryMatch || regionMatch;
}

// --- Public (visitors / authed users) ---

// GET /api/ads/live?placement=home_top — ads currently servable
const live = financeHandler(async (req, res) => {
  await adRequestService.sweep();
  const items = await Ad.listLive({ placement: req.query.placement, applyExclusivity: false });
  // Geo-filter: if any ad declared targeting, resolve visitor's
  // location once and drop ads that don't match.
  const needsGeo = items.some((a) =>
    (Array.isArray(a.target_countries) && a.target_countries.length) ||
    (Array.isArray(a.target_cities)    && a.target_cities.length)    ||
    (Array.isArray(a.target_regions)   && a.target_regions.length));
  let geo = null;
  if (needsGeo) {
    try { geo = await ipGeo.resolveVisitorGeo(req); } catch (_) { /* targeted ads stay hidden */ }
  }
  const filtered = items.filter((a) => matchesGeo(a, geo));
  const exclusives = filtered.filter(a => a.exclusive);
  return success(res, exclusives.length ? exclusives : filtered);
});

// POST /api/ads/:id/view  — fire-and-forget tracker called when an ad
// is actually shown to a visitor; expires the ad once max_views is hit.
const trackView = financeHandler(async (req, res) => {
  if (!await Ad.bumpViews(Number(req.params.id))) return notFound(res);
  // Best-effort cap enforcement on every Nth call would be cheaper,
  // but expireOverdue is cheap enough to run on the bump for now.
  await adRequestService.sweep();
  return success(res, null);
});

// POST /api/ads/:id/click — count + return the click-through link
const trackClick = financeHandler(async (req, res) => {
  const ad = await Ad.bumpClicks(Number(req.params.id));
  if (!ad) return notFound(res);
  return success(res, { link: ad?.link || null });
});

// --- Authenticated user ---

// GET /api/ads/me — my submitted ads + pricing config
const myAds = financeHandler(async (req, res) => {
  await adRequestService.sweep();
  const [config, ads] = await Promise.all([
    adRequestService.getConfig(),
    Ad.listForUser(req.user.id),
  ]);
  return success(res, { config, ads });
});

// POST /api/ads/quote — preview total cost without saving anything
const previewQuote = financeHandler(async (req, res) => {
  const config = await adRequestService.getConfig();
  return success(res, {
    config,
    quote: adRequestService.quote({
      duration_days: req.body.duration_days,
      max_views: req.body.max_views,
      placements: req.body.placements,
      exclusive: req.body.exclusive,
      config,
    }),
  });
});

// GET /api/ads/placement-pricing — public so the /promote form can show rates
const placementPricing = financeHandler(async (req, res) => {
  const rows = await AdPlacementPricing.listAll();
  return success(res, rows);
});

// GET /api/ads/my-geo — visitor's resolved geo (for debugging /
// previewing geo-targeting from the promote page or admin form).
const myGeo = financeHandler(async (req, res) => {
  const geo = await ipGeo.resolveVisitorGeo(req);
  return success(res, { geo, ip: ipGeo.ipFromRequest(req) || null });
});

// POST /api/ads/request — submit a new ad request
const submit = financeHandler(async (req, res) => {
  const result = await adRequestService.submit({ user: req.user, payload: req.body });
  if (!result.ok) {
    if (result.error === 'disabled')         return error(res, req.t('ads_user_requests_disabled'), 403);
    if (result.error === 'missing_fields')   return error(res, req.t('invalid_data'), 400);
    if (result.error === 'invalid_duration') return error(res, req.t('ad_invalid_duration'), 400);
    if (result.error === 'invalid_views')    return error(res, req.t('ad_invalid_views'), 400);
    if (result.error === 'invalid_placement')return error(res, req.t('ad_invalid_placement'), 400);
    return error(res, result.error);
  }
  return created(res, result.ad, req.t('ad_request_sent'));
});

// POST /api/ads/:id/pay — user pays for an approved ad
const pay = financeHandler(async (req, res) => {
  const result = await adRequestService.pay({ user: req.user, adId: Number(req.params.id) });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'payment_not_configured') return error(res, result.message, 503);
    if (result.error === 'forbidden')   return forbidden(res);
    if (result.error === 'wrong_state') return error(res, req.t('ad_not_approved_yet'), 409);
    return error(res, result.error);
  }
  return success(res, result.ad, req.t('ad_payment_received'));
});

// GET /api/ads/:id/stats — owner-only daily stats for the last 30 days
const stats = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  if (ad.user_id !== req.user.id && !hasPermission(req.user, 'ads.manage')) return forbidden(res);
  const days = Math.min(60, Math.max(7, Number(req.query.days) || 14));
  const daily = await Ad.dailyStats(ad.id, days);
  return success(res, {
    ad: {
      id: ad.id, title: ad.title, status: ad.status,
      views_count: ad.views_count, clicks_count: ad.clicks_count,
      max_views: ad.max_views, starts_at: ad.starts_at, ends_at: ad.ends_at,
      activated_at: ad.activated_at,
    },
    daily,
  });
});

const pauseMine = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  if (ad.user_id !== req.user.id) return forbidden(res);
  if (ad.status !== 'active') return error(res, req.t('ad_wrong_state'), 409);
  const updated = await Ad.pause(ad.id);
  if (!updated) return error(res, req.t('ad_wrong_state'), 409);
  return success(res, updated);
});

const resumeMine = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  if (ad.user_id !== req.user.id) return forbidden(res);
  if (ad.status !== 'paused') return error(res, req.t('ad_wrong_state'), 409);
  const updated = await Ad.resume(ad.id);
  if (!updated) return error(res, req.t('ad_wrong_state'), 409);
  return success(res, updated);
});

// POST /api/ads/:id/cancel
const cancel = financeHandler(async (req, res) => {
  const result = await adRequestService.cancel({ user: req.user, adId: Number(req.params.id) });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'forbidden')   return forbidden(res);
    if (result.error === 'wrong_state') return error(res, req.t('cannot_cancel_now'), 409);
    return error(res, result.error);
  }
  return success(res, result.ad, req.t('cancelled'));
});

// --- Admin ---

// GET /api/admin/ads — extended with status filter + pagination
const adminList = financeHandler(async (req, res) => {
  await adRequestService.sweep();
  const { status, placement, page = 1, limit = 30 } = req.query;
  const { items, total } = await Ad.listPaginated({ status, placement, page, limit });
  return paginate(res, items, total, page, limit);
});

const adminPause = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  const updated = await Ad.pause(ad.id);
  if (!updated) return error(res, req.t('ad_wrong_state'), 409);
  return success(res, updated, req.t('updated'));
});

const adminResume = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  const updated = await Ad.resume(ad.id);
  if (!updated) return error(res, req.t('ad_wrong_state'), 409);
  return success(res, updated, req.t('updated'));
});

const adminStats = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  const days = Math.min(60, Math.max(7, Number(req.query.days) || 14));
  const daily = await Ad.dailyStats(ad.id, days);
  return success(res, { ad, daily });
});

// Admin reads + edits per-placement pricing. The PUT accepts an
// array of { placement, price_per_day, price_per_1k_views,
// exclusive_multiplier, is_active } so a whole table is saved in
// one request.
const adminListPricing = financeHandler(async (req, res) => {
  const rows = await AdPlacementPricing.listAll();
  return success(res, rows);
});

const adminBulkUpsertPricing = financeHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.some(it => !it || !adRequestService.ALLOWED_PLACEMENTS.includes(it.placement))) return error(res, req.t('invalid_data'), 400);
  await AdPlacementPricing.bulkUpsert(items);
  const rows = await AdPlacementPricing.listAll();
  return success(res, rows, req.t('updated'));
});

// Diagnostic — admin can check exactly what /api/ads/live would
// return for a placement, without spoofing a visitor.
const adminPreviewLive = financeHandler(async (req, res) => {
  await adRequestService.sweep();
  const items = await Ad.listLive({ placement: req.query.placement });
  return success(res, items);
});

// Why isn't this ad serving? Returns a list of checks with pass/fail
// + reason, plus the resolved visitor geo, so the admin can see
// exactly which gate is blocking the ad.
const adminDiagnose = financeHandler(async (req, res) => {
  const ad = await Ad.findById(Number(req.params.id));
  if (!ad) return notFound(res);
  const placement = req.query.placement || ad.placement || 'home_top';
  const geo = await ipGeo.resolveVisitorGeo(req).catch(() => null);
  const now = new Date();

  const checks = [];
  checks.push({
    name: 'status',
    pass: ad.status === 'active',
    actual: ad.status,
    expected: 'active',
  });
  checks.push({
    name: 'is_active',
    pass: !!ad.is_active,
    actual: !!ad.is_active,
    expected: true,
  });
  checks.push({
    name: 'starts_at',
    pass: !ad.starts_at || new Date(ad.starts_at) <= now,
    actual: ad.starts_at || null,
  });
  checks.push({
    name: 'ends_at',
    pass: !ad.ends_at || new Date(ad.ends_at) > now,
    actual: ad.ends_at || null,
  });
  checks.push({
    name: 'view_cap',
    pass: !ad.max_views || ad.views_count < ad.max_views,
    actual: `${ad.views_count || 0} / ${ad.max_views || '∞'}`,
  });
  const placements = Array.isArray(ad.placements) && ad.placements.length
    ? ad.placements
    : [ad.placement];
  checks.push({
    name: 'placement_match',
    pass: placements.includes(placement),
    actual: placements,
    expected: placement,
  });
  checks.push({
    name: 'geo_match',
    pass: matchesGeo(ad, geo),
    actual: {
      visitor_country: geo?.country || null,
      visitor_region:  geo?.region  || null,
      visitor_city:    geo?.city    || null,
      visitor_source:  geo?.source  || null,
    },
    expected: {
      countries: ad.target_countries || null,
      regions:   ad.target_regions   || null,
      cities:    ad.target_cities    || null,
    },
  });
  // Also include exclusivity context — admin can see whether another
  // exclusive ad is overshadowing this one in the same placement.
  const competing = await Ad.listLive({ placement });
  const isExclusive = competing.some((a) => a.exclusive && a.id !== ad.id);
  if (isExclusive && !ad.exclusive) {
    checks.push({
      name: 'overshadowed_by_exclusive',
      pass: false,
      actual: 'another exclusive ad is taking this placement',
    });
  }

  const live = checks.every((c) => c.pass);
  return success(res, { ad, checks, live, geo, placement });
});

const adminApprove = financeHandler(async (req, res) => {
  const result = await adRequestService.approve({ adId: Number(req.params.id), adminId: req.user.id });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'wrong_state') return error(res, req.t('ad_wrong_state'), 409);
    return error(res, result.error);
  }
  return success(res, result.ad, req.t('ad_approved'));
});

const adminReject = financeHandler(async (req, res) => {
  const result = await adRequestService.reject({
    adId: Number(req.params.id), adminId: req.user.id, reason: req.body?.reason,
  });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'wrong_state') return error(res, req.t('ad_wrong_state'), 409);
    return error(res, result.error);
  }
  return success(res, result.ad, req.t('ad_rejected'));
});

const adminActivate = financeHandler(async (req, res) => {
  const result = await adRequestService.activate({ adId: Number(req.params.id) });
  if (!result.ok) {
    if (result.error === 'not_found')   return notFound(res);
    if (result.error === 'wrong_state') return error(res, req.t('ad_wrong_state'), 409);
    if (result.error === 'payment_required') return error(res, 'Verified payment required', 409);
    return error(res, result.error);
  }
  return success(res, result.ad, req.t('ad_activated'));
});

module.exports = {
  live, trackView, trackClick,
  myAds, previewQuote, placementPricing, myGeo, submit, pay, cancel,
  stats, pauseMine, resumeMine,
  adminList, adminApprove, adminReject, adminActivate,
  adminPause, adminResume, adminStats,
  adminListPricing, adminBulkUpsertPricing, adminPreviewLive, adminDiagnose,
};
