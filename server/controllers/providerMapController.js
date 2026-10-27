const { query } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { distanceKm, isValidLatLng } = require('../services/geoService');
const { availability } = require('../utils/providerAvailability');

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

module.exports = { nearby, publicPoint };
