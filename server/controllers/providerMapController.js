const { query } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { distanceKm, isValidLatLng } = require('../services/geoService');
const { availability } = require('../utils/providerAvailability');
const ProviderBadge = require('../models/ProviderBadge');

const MAX_RADIUS_KM = 200;
const MAX_RESULTS = 50;

function parseServiceIds(value) {
  if (Array.isArray(value)) return value.map(Number);
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(Number) : []; }
  catch (_) { return []; }
}

// Where a provider may be shown publicly: the exact fixed point after opting in,
// otherwise the city center. Mobile providers are never pinned to a private point.
// Number(null) is 0, so missing coordinates must be rejected before conversion.
const validPoint = (lat, lon) => lat != null && lon != null && isValidLatLng(Number(lat), Number(lon));

function publicPoint(row) {
  const exact = Number(row.show_location_on_map) === 1 && row.location_mode !== 'mobile'
    && validPoint(row.fixed_latitude, row.fixed_longitude);
  if (exact) return { latitude: Number(row.fixed_latitude), longitude: Number(row.fixed_longitude), precision: 'exact' };
  if (validPoint(row.city_latitude, row.city_longitude)) {
    return { latitude: Number(row.city_latitude), longitude: Number(row.city_longitude), precision: 'city' };
  }
  return null;
}

// GET /api/providers/nearby?lat&lon&radius_km&category_id&service_id
const nearby = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isValidLatLng(lat, lon)) return error(res, req.t ? req.t('invalid_data') : 'Invalid coordinates', 400);
  const radius = Math.min(Math.max(Number(req.query.radius_km) || 25, 1), MAX_RADIUS_KM);
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const serviceId = req.query.service_id ? Number(req.query.service_id) : null;
  if ((categoryId !== null && !Number.isSafeInteger(categoryId)) || (serviceId !== null && !Number.isSafeInteger(serviceId))) {
    return error(res, req.t ? req.t('invalid_data') : 'Invalid filter', 400);
  }

  const rows = await query(`
    SELECT u.id, u.full_name, u.avatar, u.is_verified, u.is_online,
           pp.business_name, pp.category_id, pp.service_ids, pp.service_radius_km,
           pp.rating_avg, pp.rating_count, pp.completed_orders, pp.location_mode,
           pp.show_location_on_map, pp.fixed_latitude, pp.fixed_longitude,
           to_jsonb(pp)->>'availability_status' AS availability_status, to_jsonb(pp)->>'vacation_from' AS vacation_from,
           to_jsonb(pp)->>'vacation_to' AS vacation_to, to_jsonb(pp)->>'work_days' AS work_days,
           to_jsonb(pp)->>'work_from' AS work_from, to_jsonb(pp)->>'work_to' AS work_to,
           c.latitude AS city_latitude, c.longitude AS city_longitude,
           c.name_ar AS city_name_ar, c.name_en AS city_name_en
    FROM users u
    JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN cities c ON c.id = u.city_id
    WHERE u.role = 'provider' AND u.is_active = 1 AND u.is_blocked = 0 AND u.deleted_at IS NULL`);
  // A provider may work in several professions: match any of their services.
  const categoryServices = categoryId !== null
    ? new Set((await query('SELECT id FROM services WHERE category_id = ?', [categoryId])).map(row => Number(row.id))) : null;
  const availableOnly = req.query.available === '1';

  const providers = [];
  for (const row of rows) {
    if (serviceId !== null && !parseServiceIds(row.service_ids).includes(serviceId)) continue;
    if (categoryServices && Number(row.category_id) !== categoryId && !parseServiceIds(row.service_ids).some(id => categoryServices.has(id))) continue;
    const status = availability(row);
    if (availableOnly && status.state !== 'available') continue;
    const point = publicPoint(row);
    if (!point) continue;
    const distance = distanceKm(lat, lon, point.latitude, point.longitude);
    if (distance > radius) continue;
    providers.push({
      id: row.id,
      full_name: row.full_name,
      business_name: row.business_name,
      avatar: row.avatar,
      is_verified: Number(row.is_verified) === 1,
      is_online: Number(row.is_online) === 1,
      category_id: row.category_id,
      rating_avg: Number(row.rating_avg) || 0,
      rating_count: Number(row.rating_count) || 0,
      completed_orders: Number(row.completed_orders) || 0,
      service_radius_km: Number(row.service_radius_km) || null,
      city_name_ar: row.city_name_ar,
      city_name_en: row.city_name_en,
      latitude: point.latitude,
      longitude: point.longitude,
      location_precision: point.precision,
      distance_km: Math.round(distance * 10) / 10,
      availability: status,
    });
  }
  // Providers available now come first, then by distance.
  providers.sort((a, b) => (a.availability.state !== 'available') - (b.availability.state !== 'available') || a.distance_km - b.distance_km);
  return success(res, { providers: providers.slice(0, MAX_RESULTS), radius_km: radius });
});

// GET /api/providers/matching?service_id|category_id[&district_id&city_id]  (AYK-035)
// The core of the site: providers who serve the requester's area (their coverage
// districts, else their coverage city, else their own city) in the profession asked
// for. Ranked: featured (a paid, verified badge) first, then the highest rated.
// A signed-in user's registered district and city are used unless others are given.
const optionalId = value => (value == null || value === '' ? null : Number(value));
const validIds = ids => ids.every(v => v === null || (Number.isSafeInteger(v) && v > 0));

// The area to look at: the given district/city, else the signed-in user's registered one.
async function resolveArea(req) {
  let districtId = optionalId(req.query.district_id), cityId = optionalId(req.query.city_id);
  if (!validIds([districtId, cityId])) return { invalid: true };
  if (!districtId && !cityId && req.user) {
    const me = (await query('SELECT city_id, district_id FROM users WHERE id = ?', [req.user.id]))[0];
    districtId = me?.district_id ? Number(me.district_id) : null;
    cityId = me?.city_id ? Number(me.city_id) : null;
  }
  if (districtId && !cityId) cityId = Number((await query('SELECT city_id FROM districts WHERE id = ?', [districtId]))[0]?.city_id) || null;
  if (!cityId) return { districtId: null, cityId: null, area: null };
  const names = (await query(`SELECT c.name_ar AS city_name_ar, c.name_en AS city_name_en, d.name_ar AS district_name_ar, d.name_en AS district_name_en
    FROM cities c LEFT JOIN districts d ON d.id = ? AND d.city_id = c.id WHERE c.id = ?`, [districtId, cityId]))[0] || {};
  return { districtId, cityId, area: { city_id: cityId, district_id: districtId, ...names } };
}

// Category of every service, so a provider's services count per profession.
async function serviceCategories() {
  return new Map((await query('SELECT id, category_id FROM services')).map(row => [Number(row.id), Number(row.category_id)]));
}
const providerCategories = (row, byService) => new Set([
  ...parseServiceIds(row.service_ids).map(id => byService.get(id)).filter(Boolean),
  ...(row.category_id ? [Number(row.category_id)] : []),
]);

// Active providers serving a district (or a whole city).
function coveringProviders({ districtId, cityId, excludeId = 0 }) {
  // Coverage: an explicit district list wins; without one the coverage city, else the home city.
  const coverage = districtId
    ? `(EXISTS (SELECT 1 FROM provider_coverage_districts pcd WHERE pcd.user_id = u.id AND pcd.district_id = ?)
        OR (NOT EXISTS (SELECT 1 FROM provider_coverage_districts pcd WHERE pcd.user_id = u.id)
            AND COALESCE(pp.coverage_city_id, u.city_id) = ?))`
    : `(EXISTS (SELECT 1 FROM provider_coverage_districts pcd JOIN districts d ON d.id = pcd.district_id WHERE pcd.user_id = u.id AND d.city_id = ?)
        OR (NOT EXISTS (SELECT 1 FROM provider_coverage_districts pcd WHERE pcd.user_id = u.id)
            AND COALESCE(pp.coverage_city_id, u.city_id) = ?))`;
  return query(`
    SELECT u.id, u.full_name, u.avatar, u.is_verified, u.is_online,
           pp.business_name, pp.category_id, pp.service_ids,
           pp.rating_avg, pp.rating_count, pp.completed_orders,
           cat.name_ar AS category_name_ar, cat.name_en AS category_name_en, cat.name_translations AS category_name_translations,
           dist.name_ar AS district_name_ar, dist.name_en AS district_name_en,
           to_jsonb(pp)->>'availability_status' AS availability_status, to_jsonb(pp)->>'vacation_from' AS vacation_from,
           to_jsonb(pp)->>'vacation_to' AS vacation_to, to_jsonb(pp)->>'work_days' AS work_days,
           to_jsonb(pp)->>'work_from' AS work_from, to_jsonb(pp)->>'work_to' AS work_to,
           EXISTS (SELECT 1 FROM provider_badges pb WHERE pb.user_id = u.id AND pb.badge_type = 'featured' AND pb.status = 'active'
                   AND pb.ends_at > CURRENT_TIMESTAMP AND ${ProviderBadge.verifiedPaymentSql('pb')}) AS is_featured
    FROM users u
    JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN categories cat ON cat.id = pp.category_id
    LEFT JOIN districts dist ON dist.id = u.district_id
    WHERE u.role = 'provider' AND u.is_active = 1 AND u.is_blocked = 0 AND u.deleted_at IS NULL
      AND u.id <> ? AND ${coverage}`,
  [excludeId, districtId || cityId, cityId]);
}

const matching = asyncHandler(async (req, res) => {
  const categoryId = optionalId(req.query.category_id), serviceId = optionalId(req.query.service_id);
  const where = await resolveArea(req);
  if (where.invalid || !validIds([categoryId, serviceId])) return error(res, req.t ? req.t('invalid_data') : 'Invalid filter', 400);
  if (!where.cityId) return success(res, { area: null, providers: [] });
  const categoryServices = categoryId !== null
    ? new Set((await query('SELECT id FROM services WHERE category_id = ?', [categoryId])).map(row => Number(row.id))) : null;
  const list = async scope => listProviders(await coveringProviders({ ...scope, excludeId: req.user?.id || 0 }),
    { categoryId, serviceId, categoryServices, cityId: where.cityId });
  const providers = await list(where);
  // With a district: also everyone serving the whole city (AYK-055), for the "widen" step and
  // the small "everyone in your city" box.
  const cityProviders = where.districtId ? await list({ districtId: null, cityId: where.cityId }) : null;
  return success(res, {
    area: where.area,
    providers: providers.slice(0, MAX_RESULTS),
    ...(cityProviders ? { city_providers: cityProviders.slice(0, MAX_RESULTS) } : {}),
  });
});

// Filters covering providers by profession, drops those whose required subscription is
// missing (AYK-042), and ranks them: available now first, then featured, then rating.
async function listProviders(rows, { categoryId, serviceId, categoryServices, cityId }) {
  const providers = [];
  for (const row of rows) {
    const services = parseServiceIds(row.service_ids);
    if (serviceId !== null && !services.includes(serviceId)) continue;
    if (categoryServices && Number(row.category_id) !== categoryId && !services.some(s => categoryServices.has(s))) continue;
    providers.push({
      id: row.id, full_name: row.full_name, business_name: row.business_name, avatar: row.avatar,
      is_verified: Number(row.is_verified) === 1, is_online: Number(row.is_online) === 1,
      is_featured: row.is_featured === true || Number(row.is_featured) === 1,
      category_id: row.category_id, service_ids: services,
      rating_avg: Number(row.rating_avg) || 0, rating_count: Number(row.rating_count) || 0,
      completed_orders: Number(row.completed_orders) || 0,
      availability: availability(row),
      // Shown on the card: profession and district (AYK-041).
      category_name_ar: row.category_name_ar, category_name_en: row.category_name_en, category_name_translations: row.category_name_translations,
      district_name_ar: row.district_name_ar, district_name_en: row.district_name_en,
    });
  }
  // Providers who need a subscription here and have none are not listed (AYK-042).
  const allowed = [...await require('../services/subscriptionRules').keepAllowed(providers, {
    cityId, categoryOf: p => categoryId || p.category_id })];
  allowed.sort((a, b) => ((a.availability.state !== 'available') - (b.availability.state !== 'available'))
    || (b.is_featured - a.is_featured)
    || (b.rating_avg - a.rating_avg) || (b.rating_count - a.rating_count)
    || (b.completed_orders - a.completed_orders));
  return allowed;
}

// Providers to tell about a new request right away (AYK-041): those covering its
// district (or city) in its profession who are working now.
async function availableForRequest({ districtId, cityId, categoryId, serviceId, excludeId = 0 }) {
  if (!cityId) return [];
  const rows = await coveringProviders({ districtId: districtId || null, cityId, excludeId });
  const categoryServices = categoryId ? new Set((await query('SELECT id FROM services WHERE category_id = ?', [categoryId])).map(row => Number(row.id))) : null;
  const working = rows.filter(row => {
    const services = parseServiceIds(row.service_ids);
    if (serviceId && !services.includes(Number(serviceId))) return false;
    if (categoryServices && Number(row.category_id) !== Number(categoryId) && !services.some(s => categoryServices.has(s))) return false;
    return availability(row).state === 'available';
  });
  // Without a needed subscription, a provider is not told about the request (AYK-042).
  const allowed = await require('../services/subscriptionRules').keepAllowed(working, { cityId, categoryOf: row => categoryId || row.category_id });
  return allowed.map(row => Number(row.id));
}

// GET /api/providers/area-stats[?district_id&city_id]  (AYK-036)
// For requesters: per profession in their area, how many providers serve it, how many
// are available now and featured, their average rating, and open requests there.
const areaStats = asyncHandler(async (req, res) => {
  const where = await resolveArea(req);
  if (where.invalid) return error(res, req.t ? req.t('invalid_data') : 'Invalid filter', 400);
  if (!where.cityId) return success(res, { area: null, categories: [], totals: null });
  const [rows, byService] = await Promise.all([coveringProviders({ ...where, excludeId: req.user?.id || 0 }), serviceCategories()]);
  const stats = new Map();
  const entry = id => { if (!stats.has(id)) stats.set(id, { category_id: id, providers: 0, available: 0, featured: 0, rated: 0, rating_sum: 0, open_requests: 0 }); return stats.get(id); };
  let available = 0;
  for (const row of rows) {
    const isAvailable = availability(row).state === 'available';
    if (isAvailable) available += 1;
    for (const categoryId of providerCategories(row, byService)) {
      const e = entry(categoryId);
      e.providers += 1;
      if (isAvailable) e.available += 1;
      if (row.is_featured === true || Number(row.is_featured) === 1) e.featured += 1;
      if (Number(row.rating_count) > 0) { e.rated += 1; e.rating_sum += Number(row.rating_avg) || 0; }
    }
  }
  const open = await query(`SELECT COALESCE(r.category_id, s.category_id) AS category_id, COUNT(*) AS n
    FROM requests r LEFT JOIN services s ON s.id = r.service_id
    WHERE r.status = 'open' AND r.deleted_at IS NULL AND ${where.districtId ? 'r.district_id = ?' : 'r.city_id = ?'}
    GROUP BY COALESCE(r.category_id, s.category_id)`, [where.districtId || where.cityId]);
  for (const row of open) if (row.category_id) entry(Number(row.category_id)).open_requests = Number(row.n);
  const categories = [...stats.values()].map(({ rated, rating_sum, ...e }) => ({ ...e, rating_avg: rated ? Math.round((rating_sum / rated) * 10) / 10 : null }));
  return success(res, {
    area: where.area, categories,
    totals: { providers: rows.length, available, open_requests: open.reduce((sum, row) => sum + Number(row.n), 0) },
  });
});

// GET /api/providers/my-market  (AYK-036)
// For a provider: per profession in the neighbourhoods they cover, how many other
// providers compete, how many open requests wait now, how many requesters asked in the
// last 30 days, and how many requesters live there.
const myMarket = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'provider') return error(res, req.t ? req.t('forbidden') : 'Forbidden', 403);
  const me = (await query(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS city_id
    FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = ?`, [req.user.id]))[0];
  if (!me) return success(res, { areas: 0, categories: [] });
  const byService = await serviceCategories();
  const mine = [...providerCategories(me, byService)];
  const covered = (await query('SELECT district_id FROM provider_coverage_districts WHERE user_id = ?', [req.user.id])).map(row => Number(row.district_id));
  const areas = covered.length ? covered.map(districtId => ({ districtId, cityId: null })) : me.city_id ? [{ districtId: null, cityId: Number(me.city_id) }] : [];
  if (!areas.length || !mine.length) return success(res, { areas: areas.length, categories: [] });
  if (covered.length) {
    const cities = await query(`SELECT id, city_id FROM districts WHERE id IN (${covered.map(() => '?').join(', ')})`, covered);
    for (const a of areas) a.cityId = Number(cities.find(c => Number(c.id) === a.districtId)?.city_id) || null;
  }
  // Competitors: other providers in the same profession serving any of the same neighbourhoods.
  const competitors = new Map(mine.map(id => [id, new Set()]));
  for (const a of areas.filter(x => x.cityId)) {
    for (const row of await coveringProviders({ ...a, excludeId: req.user.id })) {
      for (const categoryId of providerCategories(row, byService)) competitors.get(categoryId)?.add(Number(row.id));
    }
  }
  const areaSql = covered.length ? `r.district_id IN (${covered.map(() => '?').join(', ')})` : 'r.city_id = ?';
  const areaParams = covered.length ? covered : [Number(me.city_id)];
  const catSql = mine.map(() => '?').join(', ');
  const requests = await query(`SELECT COALESCE(r.category_id, s.category_id) AS category_id,
      SUM(CASE WHEN r.status = 'open' THEN 1 ELSE 0 END) AS open_now,
      COUNT(DISTINCT CASE WHEN r.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN r.client_id END) AS requesters_30d,
      SUM(CASE WHEN r.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 ELSE 0 END) AS requests_30d
    FROM requests r LEFT JOIN services s ON s.id = r.service_id
    WHERE r.deleted_at IS NULL AND r.client_id <> ? AND ${areaSql} AND COALESCE(r.category_id, s.category_id) IN (${catSql})
    GROUP BY COALESCE(r.category_id, s.category_id)`, [req.user.id, ...areaParams, ...mine]);
  const userAreaSql = covered.length ? `u.district_id IN (${covered.map(() => '?').join(', ')})` : 'u.city_id = ?';
  const residents = Number((await query(`SELECT COUNT(*) AS n FROM users u WHERE u.deleted_at IS NULL AND u.is_active = 1
      AND (u.role = 'client' OR COALESCE(u.also_client, 0) = 1) AND u.id <> ? AND ${userAreaSql}`, [req.user.id, ...areaParams]))[0]?.n) || 0;
  const categories = mine.map(id => {
    const r = requests.find(row => Number(row.category_id) === id) || {};
    return { category_id: id, competitors: competitors.get(id).size, open_now: Number(r.open_now) || 0,
      requesters_30d: Number(r.requesters_30d) || 0, requests_30d: Number(r.requests_30d) || 0 };
  });
  return success(res, { areas: areas.length, requesters_in_area: residents, categories });
});

module.exports = { nearby, matching, areaStats, myMarket, publicPoint, availableForRequest };
