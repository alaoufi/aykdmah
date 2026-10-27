// User-submitted ad workflow + pricing.
//
//   requested → admin approves → awaiting_payment → user pays → active
//
// Pricing is two-axis: per-day + per-1k-views. The ad ends when EITHER
// axis fills up (whichever comes first). Both bounds are mandatory so
// the price quote is deterministic.

const Setting = require('../models/Setting');
const Ad = require('../models/Ad');
const AdPlacementPricing = require('../models/AdPlacementPricing');
const { money, invalid, validId } = require('../models/Payment');
const paymentService = require('./paymentService');

// Add new spots here as the UI grows — frontend simply reads this list
// from /settings/public is the eventual move; for now both sides keep
// the catalog in sync manually.
const ALLOWED_PLACEMENTS = [
  'home_top',         'home_hero',       'home_middle',    'home_bottom',
  'services_top',     'services_bottom',
  'category_top',     'category_bottom',
  'request_details_top', 'request_details_bottom',
  'sidebar',          'search',
  'profile_top',      'chat_sidebar',
  'footer',
];

async function getConfig() {
  const keys = [
    'ads_user_requests_enabled',
    'ads_price_per_day',     'ads_price_per_1k_views',
    'ads_min_duration_days', 'ads_max_duration_days',
    'ads_min_views',         'ads_max_views',
  ];
  const [s, pricing] = await Promise.all([
    Setting.getMany(keys),
    AdPlacementPricing.asMap(),
  ]);
  const num = (v, fb) => v == null ? fb : Number(v);
  const fallbackDay  = money(s.ads_price_per_day ?? 5);
  const fallbackView = money(s.ads_price_per_1k_views ?? 10);
  const minDays = num(s.ads_min_duration_days, 1), maxDays = num(s.ads_max_duration_days, 90);
  const minViews = num(s.ads_min_views, 500), maxViews = num(s.ads_max_views, 100000);
  if (![minDays, maxDays, minViews, maxViews].every(Number.isSafeInteger) || minDays < 1 || maxDays < minDays || maxDays > 3650 || minViews < 1 || maxViews < minViews || maxViews > 100000000) throw invalid('Invalid advertising limits');
  // Per-placement row → plain object the client can read.
  const pricingByPlacement = {};
  for (const p of ALLOWED_PLACEMENTS) {
    const row = pricing[p];
    pricingByPlacement[p] = {
      placement: p,
      price_per_day:        money(row?.price_per_day ?? fallbackDay),
      price_per_1k_views:   money(row?.price_per_1k_views ?? fallbackView),
      exclusive_multiplier: money(row?.exclusive_multiplier ?? 2),
      is_active:            row ? !!row.is_active : true,
    };
  }
  return {
    enabled: s.ads_user_requests_enabled !== false,
    price_per_day:      fallbackDay,         // legacy / fallback
    price_per_1k_views: fallbackView,        // legacy / fallback
    min_duration_days: minDays,
    max_duration_days: maxDays,
    min_views: minViews,
    max_views: maxViews,
    placements: ALLOWED_PLACEMENTS,
    pricing: pricingByPlacement,
  };
}

// quote — per-placement breakdown + total. Exclusive ads pay each
// placement's exclusive_multiplier on top of its base rate.
function quote({ duration_days, max_views, placements, exclusive, config }) {
  const days = Number(duration_days), views = Number(max_views);
  if (!validId(duration_days) || days < Math.max(1, config.min_duration_days) || days > Math.min(3650, config.max_duration_days)) throw invalid('Invalid advertising duration');
  if (!validId(max_views) || views < Math.max(1, config.min_views) || views > Math.min(100000000, config.max_views)) throw invalid('Invalid advertising views');
  if (exclusive !== undefined && typeof exclusive !== 'boolean') throw invalid('Invalid exclusivity');
  const raw = placements === undefined ? ['home_top'] : placements;
  if (!Array.isArray(raw) || !raw.length || raw.length > ALLOWED_PLACEMENTS.length || raw.some(p => typeof p !== 'string' || !ALLOWED_PLACEMENTS.includes(p) || !config.pricing?.[p]?.is_active)) throw invalid('Invalid advertising placement');
  const list = [...new Set(raw)];

  const breakdown = list.map((p) => {
    const row  = config.pricing[p];
    const mult = exclusive ? money(row.exclusive_multiplier) : 1;
    if (mult < 1 || mult > 99.99) throw invalid('Invalid exclusive multiplier');
    const day  = days  * row.price_per_day        * mult;
    const view = (views / 1000) * row.price_per_1k_views * mult;
    return {
      placement: p,
      price_per_day: row.price_per_day, price_per_1k_views: row.price_per_1k_views,
      multiplier: mult,
      day_cost:  Math.round(day  * 100) / 100,
      view_cost: Math.round(view * 100) / 100,
      subtotal:  Math.round((day + view) * 100) / 100,
    };
  });

  const day_cost  = breakdown.reduce((s, b) => s + b.day_cost,  0);
  const view_cost = breakdown.reduce((s, b) => s + b.view_cost, 0);
  return {
    duration_days: days, max_views: views, exclusive: !!exclusive,
    breakdown,
    day_cost:  Math.round(day_cost  * 100) / 100,
    view_cost: Math.round(view_cost * 100) / 100,
    total:     money(Math.round((day_cost + view_cost) * 100) / 100),
  };
}

async function submit({ user, payload }) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { ok: false, error: 'disabled' };

  const { title, description, image, media_type, link, exclusive,
          placements, starts_at, duration_days, max_views, notes,
          target_countries, target_cities, target_regions } = payload;

  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof image !== 'string' || !image || image.length > 255) return { ok: false, error: 'missing_fields' };
  for (const text of [description, notes]) if (text != null && (typeof text !== 'string' || text.length > 10000)) throw invalid('Invalid advertising text');
  for (const url of [image, link]) {
    if (url == null || url === '') continue;
    if (typeof url !== 'string' || url.length > 255 || /[\s\\\u0000-\u001f]/.test(url)) throw invalid('Invalid advertising URL');
    if (url.startsWith('/') && !url.startsWith('//') && !url.includes('..')) continue;
    let parsed;
    try { parsed = new URL(url); } catch (_) { throw invalid('Invalid advertising URL'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw invalid('Invalid advertising URL');
  }
  if (media_type !== undefined && !['image', 'video'].includes(media_type)) throw invalid('Invalid advertising media');

  const days  = Number(duration_days);
  const views = Number(max_views);
  if (!validId(duration_days) || days < Math.max(1, cfg.min_duration_days) || days > Math.min(3650, cfg.max_duration_days)) {
    return { ok: false, error: 'invalid_duration', config: cfg };
  }
  if (!validId(max_views) || views < Math.max(1, cfg.min_views) || views > Math.min(100000000, cfg.max_views)) {
    return { ok: false, error: 'invalid_views', config: cfg };
  }
  const rawPlacements = placements === undefined ? ['home_top'] : placements;
  if (!Array.isArray(rawPlacements) || !rawPlacements.length || rawPlacements.length > ALLOWED_PLACEMENTS.length || rawPlacements.some(p => !ALLOWED_PLACEMENTS.includes(p) || !cfg.pricing[p].is_active)) return { ok: false, error: 'invalid_placement' };
  const placementList = [...new Set(rawPlacements)];

  const q = quote({
    duration_days: days, max_views: views,
    placements: placementList, exclusive,
    config: cfg,
  });

  if (starts_at != null && (typeof starts_at !== 'string' || starts_at.length > 40)) throw invalid('Invalid start date');
  const startsAt = starts_at ? new Date(starts_at) : null;
  if (startsAt && (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < Date.now() - 300000 || startsAt.getTime() > Date.now() + 365 * 86400000)) throw invalid('Invalid start date');
  for (const [arr, max, check] of [
    [target_countries, 250, v => typeof v === 'string' && /^[A-Za-z]{2}$/.test(v)],
    [target_cities, 100, v => typeof v === 'string' && v.trim().length > 0 && v.length <= 120],
    [target_regions, 100, validId],
  ]) if (arr != null && (!Array.isArray(arr) || arr.length > max || arr.some(v => !check(v)))) throw invalid('Invalid geographic targeting');
  const ad = await Ad.create({
    user_id: user.id,
    title, description, image, media_type, link, notes,
    placement: placementList[0],
    placements: placementList,
    exclusive: !!exclusive,
    target_countries: Array.isArray(target_countries) && target_countries.length ? target_countries : null,
    target_cities:    Array.isArray(target_cities)    && target_cities.length    ? target_cities    : null,
    target_regions:   Array.isArray(target_regions)   && target_regions.length   ? target_regions.map(Number).filter(Boolean) : null,
    starts_at: startsAt,
    ends_at:   null,            // set on activate from duration_days
    duration_days: days,
    max_views: views,
    amount: q.total,
    is_active: false,
    status: 'requested',
  });
  return { ok: true, ad, quote: q };
}

async function approve({ adId, adminId }) {
  const ad = await Ad.findById(adId);
  if (!ad) return { ok: false, error: 'not_found' };
  if (ad.status !== 'requested') return { ok: false, error: 'wrong_state', state: ad.status };
  const updated = await Ad.approve(adId, adminId);
  return updated ? { ok: true, ad: updated } : { ok: false, error: 'wrong_state' };
}

async function reject({ adId, adminId, reason }) {
  const ad = await Ad.findById(adId);
  if (!ad) return { ok: false, error: 'not_found' };
  if (!['requested', 'approved', 'awaiting_payment'].includes(ad.status)) {
    return { ok: false, error: 'wrong_state', state: ad.status };
  }
  const updated = await Ad.reject(adId, adminId, reason);
  return updated ? { ok: true, ad: updated } : { ok: false, error: 'wrong_state' };
}

async function pay({ user, adId }) {
  const ad = await Ad.findById(adId);
  if (!ad) return { ok: false, error: 'not_found' };
  if (ad.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (ad.status !== 'approved') return { ok: false, error: 'wrong_state', state: ad.status };

  return { ok: false, error: 'payment_not_configured', ...paymentService.getAvailability() };
}

async function activate({ adId }) {
  const ad = await Ad.findById(adId);
  if (!ad) return { ok: false, error: 'not_found' };
  if (ad.status !== 'awaiting_payment') {
    return { ok: false, error: 'wrong_state', state: ad.status };
  }
  const updated = await Ad.activate(adId, { paymentId: ad.payment_id });
  return updated ? { ok: true, ad: updated } : { ok: false, error: 'payment_required' };
}

async function cancel({ user, adId }) {
  const ad = await Ad.findById(adId);
  if (!ad) return { ok: false, error: 'not_found' };
  if (ad.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (!['requested', 'approved', 'awaiting_payment'].includes(ad.status)) {
    return { ok: false, error: 'wrong_state', state: ad.status };
  }
  const updated = await Ad.cancel(adId);
  return updated ? { ok: true, ad: updated } : { ok: false, error: 'wrong_state' };
}

async function sweep() {
  await Ad.expireOverdue();
}

module.exports = {
  ALLOWED_PLACEMENTS,
  getConfig, quote,
  submit, approve, reject, pay, activate, cancel, sweep,
};
