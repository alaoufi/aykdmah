const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { hasPermission } = require('../middleware/roleCheck');
const { assertMarketplaceWriteAccess } = require('../middleware/verificationPolicy');
const { booleanIntent, requireCompleteLocation } = require('../utils/userLocation');
const { resolveRequestLocation } = require('../utils/requestLocation');
const User = require('./User');

function pagination(page = 1, limit = 20) {
  page = Number(page); limit = Number(limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError('invalid_pagination', 422);
  }
  return { page, limit };
}

function optionalNumber(value, min, max, integer = false) {
  if (value === undefined || value === null || value === '') return null;
  if ((typeof value !== 'string' && typeof value !== 'number') || !Number.isFinite(Number(value))
      || Number(value) < min || Number(value) > max || (integer && !Number.isSafeInteger(Number(value)))) {
    throw new ApiError('invalid_data', 422);
  }
  return Number(value);
}

function optionalDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) throw new ApiError('invalid_date', 422);
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!parts) throw new ApiError('invalid_date', 422);
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = parts;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number(year) < 1000 || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1
      || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
      || !Number.isFinite(Date.parse(value))) throw new ApiError('invalid_date', 422);
  return new Date(value).toISOString();
}

function publicView(request) {
  if (!request) return request;
  const view = { ...request };
  for (const key of ['address', 'latitude', 'longitude', 'files', 'assigned_provider_id', 'accepted_offer_id', 'assigned_provider_name', 'direct_provider_id',
    'client_name', 'hidden_at', 'client_contact_phone', 'client_contact_whatsapp', 'client_contact_name']) delete view[key]; // The requester's name stays private (AYK-142).
  // AYK-418: the numbers the requester chose to show are added back only for a provider of the
  // request's profession (requestController.withContact).
  if (view.distance_km != null) view.distance_km = Math.round(Number(view.distance_km));
  return view;
}

async function validateCreate(data, read = queryOne) {
  const text = value => (value == null ? '' : value);
  if (typeof text(data.title) !== 'string' || text(data.title).length > 200
      || typeof text(data.description) !== 'string' || text(data.description).length > 10000
      || [data.title, data.description, data.address].some(value => typeof value === 'string' && value.includes('\0'))
      || (data.address != null && (typeof data.address !== 'string' || data.address.length > 500))) throw new ApiError('invalid_data', 422);
  // Any text is accepted: a missing title comes from the description (or the
  // service name, below), and a missing description repeats the title.
  const description = text(data.description).trim();
  data = { ...data, title: text(data.title).trim() || description.split('\n')[0].slice(0, 80).trim(), description };
  for (const key of ['client_id', 'category_id', 'service_id', 'city_id', 'district_id']) data[key] = optionalNumber(data[key], 1, 2147483647, true);
  if (!data.client_id) throw new ApiError('invalid_data', 422);
  data.latitude = optionalNumber(data.latitude, -90, 90);
  data.longitude = optionalNumber(data.longitude, -180, 180);
  if ((data.latitude == null) !== (data.longitude == null)) throw new ApiError('invalid_coordinates', 422);
  for (const key of ['budget_min', 'budget_max']) {
    data[key] = optionalNumber(data[key], 0, 99999999.99);
    if (data[key] != null && Math.abs(data[key] * 100 - Math.round(data[key] * 100)) > 0.000001) throw new ApiError('invalid_budget', 422);
  }
  if (data.budget_min != null && data.budget_max != null && data.budget_min > data.budget_max) throw new ApiError('invalid_budget', 422);
  data.preferred_date = optionalDate(data.preferred_date);
  if (data.is_urgent != null && ![true,false,0,1,'true','false','0','1'].includes(data.is_urgent)) throw new ApiError('invalid_data', 422);
  data.is_urgent = [true,1,'true','1'].includes(data.is_urgent);
  if (data.category_id && !await read('SELECT id FROM categories WHERE id = ? AND is_active = 1', [data.category_id])) throw new ApiError('invalid_category', 422);
  if (data.service_id) {
    const service = await read('SELECT category_id FROM services WHERE id = ? AND is_active = 1', [data.service_id]);
    if (!service || (data.category_id && service.category_id !== data.category_id)) throw new ApiError('invalid_service', 422);
    data.category_id = service.category_id;
  }
  if (data.city_id && !await read('SELECT id FROM cities WHERE id = ? AND is_active = 1', [data.city_id])) throw new ApiError('invalid_city', 422);
  if (data.district_id) {
    const district = await read('SELECT city_id FROM districts WHERE id = ? AND is_active = 1', [data.district_id]);
    if (!district || (data.city_id && district.city_id !== data.city_id)) throw new ApiError('invalid_district', 422);
    data.city_id = district.city_id;
  }
  if (!data.title) {
    const named = data.service_id ? await read('SELECT name_ar FROM services WHERE id = ?', [data.service_id])
      : data.category_id ? await read('SELECT name_ar FROM categories WHERE id = ?', [data.category_id]) : null;
    data.title = named?.name_ar || 'طلب خدمة';
  }
  if (!data.description) data.description = data.title;
  return data;
}

const BASE_SELECT = `
  r.id, r.client_id, r.category_id, r.service_id, r.title, r.description,
  r.city_id, r.district_id, r.address, r.latitude, r.longitude,
  r.budget_min, r.budget_max, r.preferred_date, r.is_urgent, r.status,
  r.assigned_provider_id, r.accepted_offer_id, r.views_count, r.offers_count,
  r.completed_at, r.created_at, r.updated_at, r.reminders_off, r.direct_provider_id,
  r.warranty_days, r.warranty_proposed_days, r.warranty_proposed_by, r.hidden_at,
  ap.full_name AS assigned_provider_name,
  u.full_name AS client_name, u.avatar AS client_avatar,
  CASE WHEN to_jsonb(u)->>'share_phone' = '1' THEN u.phone END AS client_contact_phone,
  CASE WHEN to_jsonb(u)->>'share_whatsapp' = '1' THEN COALESCE(NULLIF(to_jsonb(u)->>'whatsapp_number', ''), u.phone) END AS client_contact_whatsapp,
  CASE WHEN to_jsonb(u)->>'share_name' = '1' THEN u.full_name END AS client_contact_name,
  CASE WHEN to_jsonb(u)->>'allow_request_share' = '1' THEN 1 ELSE 0 END AS client_allow_share,
  (SELECT COALESCE(AVG(rv.rating),0) FROM reviews rv WHERE rv.target_user_id = r.client_id AND rv.review_type = 'on_requester' AND rv.is_visible = 1 AND u.deleted_at IS NULL) AS client_rating_avg,
  (SELECT COUNT(*) FROM reviews rv WHERE rv.target_user_id = r.client_id AND rv.review_type = 'on_requester' AND rv.is_visible = 1 AND u.deleted_at IS NULL) AS client_rating_count,
  (SELECT rv.comment FROM reviews rv WHERE rv.target_user_id = r.client_id AND rv.review_type = 'on_requester' AND rv.is_visible = 1 AND u.deleted_at IS NULL AND rv.comment IS NOT NULL AND rv.comment <> '' ORDER BY rv.id DESC LIMIT 1) AS client_opinion,
  cat.name_ar AS category_name, cat.name_en AS category_name_en,
  cat.name_translations AS category_name_translations,
  svc.name_ar AS service_name, svc.name_en AS service_name_en,
  svc.name_translations AS service_name_translations,
  city.name_ar AS city_name, city.name_en AS city_name_en,
  dist.name_ar AS district_name, dist.name_en AS district_name_en
`;

const BASE_JOINS = `
  LEFT JOIN users u ON r.client_id = u.id
  LEFT JOIN users ap ON r.assigned_provider_id = ap.id
  LEFT JOIN categories cat ON r.category_id = cat.id
  LEFT JOIN services svc ON r.service_id = svc.id
  LEFT JOIN cities city ON r.city_id = city.id
  LEFT JOIN districts dist ON r.district_id = dist.id
`;

async function create(data) {
  const clientId = optionalNumber(data.client_id, 1, 2147483647, true);
  if (!clientId) throw new ApiError('invalid_data', 422);
  return transaction(async (conn) => {
    const read = async (sql, params) => (await conn.query(sql, params))[0][0] || null;
    const account = await read(`SELECT u.id, u.role, to_jsonb(u)->>'also_client' AS also_client, u.city_id, u.district_id, u.latitude, u.longitude, p.address,
      to_jsonb(u)->>'country_id' AS country_id, to_jsonb(u)->>'region_id' AS region_id,
      to_jsonb(u)->>'governorate_id' AS governorate_id
      FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL FOR UPDATE OF u`, [clientId]);
    // Admins may post too: the owner tests the site with the admin account.
    if (!account || !(['client', 'admin'].includes(account.role) || (account.role === 'provider' && Number(account.also_client) === 1))) throw new ApiError('forbidden', 403);
    const database = { queryOne: read, tableHasColumn: async (table, column) => !!await read(`SELECT 1
      FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`, [table, column]) };
    await assertMarketplaceWriteAccess(clientId, { query: async (sql, params) => (await conn.query(sql, params))[0] });
    const location = await resolveRequestLocation(data, account, database);
    data = await validateCreate({ ...data, client_id: clientId, ...location }, read);
    const [result] = await conn.execute(
      `INSERT INTO requests
        (client_id, category_id, service_id, title, description, city_id, district_id,
         address, latitude, longitude, budget_min, budget_max, preferred_date, is_urgent, remind_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.client_id, data.category_id || null, data.service_id || null, data.title, data.description,
        data.city_id || null, data.district_id || null, data.address || null,
        data.latitude ?? null, data.longitude ?? null,
        data.budget_min ?? null, data.budget_max ?? null,
        data.preferred_date || null, data.is_urgent ? 1 : 0,
        // No reminders: the requester waits for providers to contact them (AYK-041).
        null,
      ]
    );
    const requestId = result.insertId;
    if (Array.isArray(data.files) && data.files.length) {
      const values = data.files.map(f => [requestId, f.file_url, f.file_name, f.file_type, f.file_size]);
      await conn.query(
        `INSERT INTO request_files (request_id, file_url, file_name, file_type, file_size) VALUES ${values.map(() => '(' + Array(5).fill('?').join(', ') + ')').join(', ')}`,
        values.flat()
      );
    }
    if (booleanIntent(data.remember_location, 'invalid_data')) await User.saveAccountLocation(conn, clientId, location);
    else if (!account.city_id && location.city_id && location.latitude != null && location.longitude != null) {
      // An account without a location keeps its first request's place for next time
      // (AYK-044); the address is the district and city names when none was typed.
      const district = location.district_id ? await read('SELECT name_ar FROM districts WHERE id = ?', [location.district_id]) : null;
      const city = await read('SELECT name_ar FROM cities WHERE id = ?', [location.city_id]);
      const kept = { ...location, address: location.address || [district?.name_ar, city?.name_ar].filter(Boolean).join('، ') };
      let complete = true;
      try { await requireCompleteLocation(kept, 'account_location_required', database); } catch (_) { complete = false; }
      if (complete) await User.saveAccountLocation(conn, clientId, kept);
    }
    return requestId;
  });
}

// AYK-402: the owner edits an open request nobody is assigned to yet (before an agreement).
const EDITABLE = ['title', 'description', 'category_id', 'service_id', 'city_id', 'district_id', 'is_urgent'];
async function updateByOwner(id, clientId, input) {
  const current = await queryOne('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!current || Number(current.client_id) !== Number(clientId)) throw new ApiError('request_not_found', 404);
  if (current.status !== 'open' || current.assigned_provider_id) throw new ApiError('request_edit_after_agreement', 409);
  const changes = Object.fromEntries(EDITABLE.filter(key => Object.prototype.hasOwnProperty.call(input, key)).map(key => [key, input[key]]));
  // A new profession without a service clears the old service; a new city without a district clears the old district.
  if ('category_id' in changes && !('service_id' in changes)) changes.service_id = null;
  if ('city_id' in changes && !('district_id' in changes)) changes.district_id = null;
  const merged = await validateCreate({ ...current, ...changes, client_id: current.client_id, latitude: current.latitude, longitude: current.longitude,
    budget_min: current.budget_min, budget_max: current.budget_max, preferred_date: current.preferred_date ? new Date(current.preferred_date).toISOString() : null });
  if (!merged.city_id) throw new ApiError('invalid_city', 422);
  await query(`UPDATE requests SET title = ?, description = ?, category_id = ?, service_id = ?, city_id = ?, district_id = ?, is_urgent = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open' AND assigned_provider_id IS NULL`,
    [merged.title, merged.description, merged.category_id || null, merged.service_id || null, merged.city_id, merged.district_id || null,
      merged.is_urgent ? 1 : 0, id]);
  return findById(id);
}

async function findById(id) {
  id = optionalNumber(id, 1, 2147483647, true);
  if (id == null) throw new ApiError('invalid_id', 422);
  const req = await queryOne(
    `SELECT ${BASE_SELECT} FROM requests r ${BASE_JOINS} WHERE r.id = ? AND r.deleted_at IS NULL`,
    [id]
  );
  if (!req) return null;
  req.files = await query('SELECT * FROM request_files WHERE request_id = ?', [id]);
  return req;
}

async function incrementViews(id) {
  await query('UPDATE requests SET views_count = views_count + 1 WHERE id = ?', [id]);
}

async function findByClient(clientId, { status, scope, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = ['r.client_id = ?', 'r.deleted_at IS NULL'];
  const params = [clientId];
  if (status) { where.push('r.status = ?'); params.push(status); }
  // Active requests and the archive of finished ones (AYK-075).
  if (scope === 'active') where.push("r.status IN ('open', 'assigned', 'in_progress')");
  else if (scope === 'archive') where.push("r.status NOT IN ('open', 'assigned', 'in_progress')");
  else if (scope) throw new ApiError('invalid_scope', 422);
  const whereSql = where.join(' AND ');

  const items = await query(
    `SELECT ${BASE_SELECT} FROM requests r ${BASE_JOINS}
     WHERE ${whereSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM requests r WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

// AYK-398: a request in one of these states means the provider worked (or works) for that requester.
const PREVIOUS_CLIENT_STATUSES = `'assigned', 'in_progress', 'completed', 'closed'`;

// AYK-398: the requesters this provider worked for, newest first, to look up (read only).
async function previousClients(providerId, { limit = 200 } = {}) {
  return query(`
    SELECT u.id, u.role, u.full_name, u.referral_code,
           c.name_ar AS city_name_ar, c.name_en AS city_name_en, d.name_ar AS district_name_ar, d.name_en AS district_name_en,
           COUNT(p.id) AS jobs, MAX(COALESCE(p.completed_at, p.updated_at)) AS last_at,
           (ARRAY_AGG(p.id ORDER BY p.id DESC))[1] AS last_request_id,
           (ARRAY_AGG(p.title ORDER BY p.id DESC))[1] AS last_request_title,
           (SELECT o.id FROM requests o WHERE o.client_id = u.id AND o.status = 'open' AND o.deleted_at IS NULL AND o.hidden_at IS NULL
              AND (o.direct_provider_id IS NULL OR o.direct_provider_id = ?) ORDER BY o.id DESC LIMIT 1) AS open_request_id
      FROM requests p
      JOIN users u ON u.id = p.client_id AND u.deleted_at IS NULL
      LEFT JOIN cities c ON c.id = u.city_id
      LEFT JOIN districts d ON d.id = u.district_id
     WHERE p.assigned_provider_id = ? AND p.status IN (${PREVIOUS_CLIENT_STATUSES}) AND p.deleted_at IS NULL
     GROUP BY u.id, u.role, u.full_name, u.referral_code, c.name_ar, c.name_en, d.name_ar, d.name_en
     ORDER BY last_at DESC NULLS LAST, u.id DESC
     LIMIT ?`, [providerId, providerId, Number(limit)]);
}

// AYK-397: the cities of a region (cities.region_id, else their governorate's region).
const REGION_CITIES = `SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = ?`;
async function regionOfCity(cityId) {
  if (!cityId) return null;
  return Number((await queryOne(`SELECT COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE c.id = ?`, [cityId]))?.region_id) || null;
}
// AYK-397 (the owner: «الافتراضي منطقتك وله يوسّع الدائرة»). `scope` widens the area of the board:
// 'area' (a provider's coverage, a requester's district), 'city', 'region' or 'all'. `viewerId` is a
// signed-in person who is not looking as a provider: their own district, city or region.
// AYK-475: a list of ids from "1,2,3" or [1,2,3]; anything else is refused. At most 30.
function idList(value) {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  if (parts.length > 30) throw new ApiError('invalid_data', 422);
  return parts.map(part => {
    const id = Number(String(part).trim());
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new ApiError('invalid_data', 422);
    return id;
  });
}

async function findNearby({ latitude, longitude, radiusKm = 25, categoryId, serviceId, cityId, regionId = null, regionIds = null, categoryIds = null, status = 'open', page = 1, limit = 20, providerId = null, scope = null, viewerId = null } = {}) {
  // AYK-400 «فك القيود»: 'open' = every open request, whatever the profession or the area (asked for, never the default).
  if (scope && !['area', 'city', 'region', 'all', 'open'].includes(scope)) scope = 'area';
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  if (status !== 'open') throw new ApiError('invalid_status', 422);
  latitude = optionalNumber(latitude, -90, 90); longitude = optionalNumber(longitude, -180, 180);
  if ((latitude == null) !== (longitude == null)) throw new ApiError('invalid_coordinates', 422);
  radiusKm = optionalNumber(radiusKm, 0.1, 250);
  if (radiusKm == null) radiusKm = 25;
  categoryId = optionalNumber(categoryId, 1, 2147483647, true); serviceId = optionalNumber(serviceId, 1, 2147483647, true);
  // A direct contact from the requester's directory is not on the board (AYK-041).
  // AYK-361: a request the administration hid is not offered to providers.
  const where = ['r.deleted_at IS NULL', 'r.status = ?', 'r.direct_provider_id IS NULL', 'r.hidden_at IS NULL'];
  const whereParams = [status];
  cityId = optionalNumber(cityId,1,2147483647,true);
  if (cityId) {where.push('r.city_id = ?');whereParams.push(cityId);}
  // AYK-467: a visitor's «المنطقة» list (the region's cities, or their governorate's region).
  // AYK-475 (the owner: «يستطيع اختيار أكثر من منطقة وأكثر من مهنة»): several regions and professions.
  regionId = optionalNumber(regionId, 1, 2147483647, true);
  const regions = [...new Set([...(regionId ? [regionId] : []), ...idList(regionIds)])];
  const categories = [...new Set([...(categoryId ? [categoryId] : []), ...idList(categoryIds)])];
  if (regions.length) { where.push(`r.city_id IN (SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) IN (${regions.map(() => '?').join(', ')}))`); whereParams.push(...regions); }
  if (categories.length) { where.push(`r.category_id IN (${categories.map(() => '?').join(', ')})`); whereParams.push(...categories); }
  if (serviceId) { where.push('r.service_id = ?'); whereParams.push(serviceId); }
  if (providerId) {
    // A request sent straight to this provider from a directory is theirs to see (AYK-079).
    where[2] = '(r.direct_provider_id IS NULL OR r.direct_provider_id = ?)'; whereParams.splice(1, 0, providerId);
    // A "both" account's own requests are not work for it as a provider (AYK-044).
    where.push('r.client_id <> ?'); whereParams.push(providerId);
    // "Matching me": the provider's registered services and coverage area.
    // Without a coverage city the provider's own city is their area.
    const profile = await queryOne(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS coverage_city_id
      FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = ?`, [providerId]);
    let services = [];
    // PostgreSQL returns the JSON list already parsed; older rows may still be text (AYK-079).
    const rawServices = profile?.service_ids;
    try { services = (Array.isArray(rawServices) ? rawServices : JSON.parse(rawServices || '[]') || []).map(Number).filter(Number.isSafeInteger); } catch (_) { services = []; }
    const categories = services.length
      ? (await query(`SELECT DISTINCT category_id FROM services WHERE id IN (${services.map(() => '?').join(', ')})`, services)).map(row => Number(row.category_id))
      : profile?.category_id ? [Number(profile.category_id)] : [];
    // Profession and area; a request sent straight to this provider skips both (AYK-079).
    const fit = []; const fitParams = [];
    const match = [];
    // AYK-391 (the owner: «طالب سباك لم يظهر مع طالبي خدمة السباكة»): the profession decides, as the
    // owner's rule says (same profession, same coverage). A request for one service of a profession
    // (e.g. «تسليك مجاري» in plumbing) used to reach only the plumbers who ticked that very service.
    const sameProfession = categories.length
      ? (await query(`SELECT id FROM services WHERE category_id IN (${categories.map(() => '?').join(', ')})`, categories)).map(row => Number(row.id)) : [];
    const anyService = [...new Set([...services, ...sameProfession])];
    if (anyService.length) { match.push(`r.service_id IN (${anyService.map(() => '?').join(', ')})`); fitParams.push(...anyService); }
    if (categories.length) { match.push(`r.category_id IN (${categories.map(() => '?').join(', ')})`); fitParams.push(...categories); }
    if (match.length) fit.push(`(${match.join(' OR ')})`);
    const covered = !scope || scope === 'area' ? await query('SELECT district_id FROM provider_coverage_districts WHERE user_id = ?', [providerId]) : [];
    const homeCity = profile?.coverage_city_id ? Number(profile.coverage_city_id) : null;
    const region = scope === 'region' ? await regionOfCity(homeCity) : null;
    if (scope === 'all') { /* the profession anywhere */ } else if (scope === 'region' && region) {
      fit.push(`r.city_id IN (${REGION_CITIES})`); fitParams.push(region);
    } else if (scope === 'city' && homeCity) {
      fit.push('r.city_id = ?'); fitParams.push(homeCity);
    } else if (covered.length) {
      fit.push(`r.district_id IN (${covered.map(() => '?').join(', ')})`); fitParams.push(...covered.map(row => Number(row.district_id)));
    } else if (profile?.coverage_city_id) {
      fit.push('r.city_id = ?'); fitParams.push(Number(profile.coverage_city_id));
    }
    if (fit.length && scope !== 'open') { where.push(`(r.direct_provider_id = ? OR (${fit.join(' AND ')}))`); whereParams.push(providerId, ...fitParams); }
  } else if (viewerId && scope) {
    // Others' requests around a requester; their own are in «طلباتي».
    where.push('r.client_id <> ?'); whereParams.push(viewerId);
    const me = await queryOne('SELECT city_id, district_id FROM users WHERE id = ?', [viewerId]);
    const myCity = me?.city_id ? Number(me.city_id) : null;
    if (scope === 'area' && me?.district_id) { where.push('r.district_id = ?'); whereParams.push(Number(me.district_id)); }
    else if ((scope === 'area' || scope === 'city') && myCity) { where.push('r.city_id = ?'); whereParams.push(myCity); }
    else if (scope === 'region') {
      const region = await regionOfCity(myCity);
      if (region) { where.push(`r.city_id IN (${REGION_CITIES})`); whereParams.push(region); }
    }
  }

  // AYK-251: the board is every provider's first screen. It used to build the full card (six
  // joins and three review sub-queries) for EVERY open request, and only then keep one page:
  // 29 ms of database processor per call with 2,500 open requests, 120 calls a second at most.
  // Now: 1) pick the page's ids from the requests table alone, inside a latitude/longitude box
  // the index can use; 2) build the cards for those few ids only. Same rows, same order, same total.
  const hasGeo = latitude != null && longitude != null;
  const DISTANCE = `CASE WHEN r.latitude IS NULL OR r.longitude IS NULL THEN NULL ELSE (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(?)) * cos(radians(ROUND(r.latitude, 2))) *
        cos(radians(ROUND(r.longitude, 2)) - radians(?)) +
        sin(radians(?)) * sin(radians(ROUND(r.latitude, 2)))
      )))) END`;
  const boxWhere = [...where];
  const boxParams = [...whereParams];
  if (hasGeo) {
    // A square that surely contains the circle (plus the 0.01° the distance rounds positions by).
    const latSpan = radiusKm / 110.5 + 0.02;
    const lonSpan = radiusKm / (111.3 * Math.max(0.05, Math.cos(latitude * Math.PI / 180))) + 0.02;
    boxWhere.push('(r.latitude IS NULL OR r.longitude IS NULL OR (r.latitude BETWEEN ? AND ? AND r.longitude BETWEEN ? AND ?))');
    boxParams.push(latitude - latSpan, latitude + latSpan, longitude - lonSpan, longitude + lonSpan);
  }
  // OFFSET 0 keeps the distance in its own step, so it is worked out once per request (it was
  // three times: twice to filter, once to sort), and the total comes from the same pass instead
  // of a second identical scan.
  // AYK-398 (the owner: «عميل سابق طالب خدمة، يعطي الأولوية للعملاء السابقين»): for a provider, a
  // request from someone they already worked for is marked and comes first.
  const PREVIOUS = providerId
    ? `EXISTS (SELECT 1 FROM requests p WHERE p.client_id = r.client_id AND p.assigned_provider_id = ? AND p.id <> r.id
         AND p.status IN (${PREVIOUS_CLIENT_STATUSES}) AND p.deleted_at IS NULL)` : 'FALSE';
  const previousParams = providerId ? [providerId] : [];
  const candidates = hasGeo
    ? `SELECT r.id, r.is_urgent, r.created_at, ${PREVIOUS} AS previous_client, ${DISTANCE} AS distance_km FROM requests r WHERE ${boxWhere.join(' AND ')} OFFSET 0`
    : `SELECT r.id, r.is_urgent, r.created_at, ${PREVIOUS} AS previous_client FROM requests r WHERE ${boxWhere.join(' AND ')}`;
  const candidateParams = hasGeo ? [...previousParams, latitude, longitude, latitude, ...boxParams] : [...previousParams, ...boxParams];
  const within = hasGeo ? 'WHERE distance_km IS NULL OR distance_km <= ?' : '';
  const withinParams = hasGeo ? [radiusKm] : [];
  const order = `${providerId ? 'previous_client DESC, ' : ''}${hasGeo ? 'distance_km ASC, ' : ''}is_urgent DESC, created_at DESC, id DESC`;

  const page_ = await query(`SELECT id, previous_client${hasGeo ? ', distance_km' : ''}, COUNT(*) OVER () AS total FROM (${candidates}) nearby ${within} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...candidateParams, ...withinParams, Number(limit), Number(offset)]);
  let items = [];
  if (page_.length) {
    const ids = page_.map(row => row.id);
    const rows = await query(`SELECT ${BASE_SELECT} FROM requests r ${BASE_JOINS} WHERE r.id IN (${ids.map(() => '?').join(', ')})`, ids);
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    items = page_.filter(row => byId.has(Number(row.id)))
      .map(row => ({ ...byId.get(Number(row.id)), ...(hasGeo ? { distance_km: row.distance_km } : {}),
        ...(providerId ? { previous_client: row.previous_client === true || Number(row.previous_client) === 1 } : {}) }));
  }
  // A page past the end has no row to carry the total: count it then (rare).
  const total = page_.length ? page_[0].total
    : offset === 0 ? 0 : (await query(`SELECT COUNT(*) AS total FROM (${candidates}) nearby ${within}`, [...candidateParams, ...withinParams]))[0].total;
  return { items, total };

}

// The requester stops (or restarts) the "Did you find someone?" reminders.
async function setRemindersOff(id, clientId, off) {
  const result = await query('UPDATE requests SET reminders_off = ? WHERE id = ? AND client_id = ? AND deleted_at IS NULL', [off ? 1 : 0, id, clientId]);
  return result.affectedRows > 0;
}

async function updateStatus(id, status, extra = {}) {
  if (!extra.actor || !Number.isSafeInteger(extra.actor.id)) throw new ApiError('forbidden', 403);
  await transaction(async conn => {
    const [[request]] = await conn.query('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!request) throw new ApiError('request_not_found', 404);
    const actor = extra.actor;
    const owner = actor && actor.id === request.client_id;
    const assigned = actor && actor.id === request.assigned_provider_id;
    const admin = hasPermission(actor, 'requests.manage');
    if (actor && !owner && !assigned && !admin) throw new ApiError('forbidden', 403);
    if (!admin && ['cancelled', 'closed'].includes(status) && !owner) throw new ApiError('forbidden', 403);
    // Withdrawing (back to open) is for the assigned provider only (AYK-071).
    if (status === 'open' && !assigned) throw new ApiError('forbidden', 403);
    const transitions = {
      open: ['assigned', 'cancelled'], assigned: ['in_progress', 'completed', 'cancelled', 'open'],
      in_progress: ['completed', 'cancelled', 'open'], completed: ['closed'], cancelled: ['closed'], closed: [],
    };
    if (!transitions[request.status]?.includes(status)) throw new ApiError('invalid_status_transition', 409);
    if (status === 'assigned' && (!admin || !extra.assigned_provider_id)) throw new ApiError('invalid_assignment', 409);
    if (['in_progress', 'completed'].includes(status) && !request.assigned_provider_id) throw new ApiError('no_assigned_provider', 409);
    const [[frozen]] = await conn.query("SELECT id FROM disputes WHERE request_id = ? AND frozen = 1 AND status IN ('open','under_review','waiting_response','escalated') LIMIT 1", [id]);
    if (frozen && !admin) throw new ApiError('dispute_frozen', 409);
    const fields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    if (status === 'assigned') {
      const providerId = optionalNumber(extra.assigned_provider_id, 1, 2147483647, true);
      const [[provider]] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'provider' AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL", [providerId]);
      if (!provider || providerId === request.client_id) throw new ApiError('invalid_assignment', 422);
      fields.push('assigned_provider_id = ?', 'accepted_offer_id = NULL', 'agreed_at = CURRENT_TIMESTAMP'); values.push(providerId);
      await conn.execute("UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending'", [id]);
    }
    if (status === 'completed') fields.push('completed_at = CURRENT_TIMESTAMP');
    if (status === 'open') fields.push('assigned_provider_id = NULL', 'accepted_offer_id = NULL', 'agreed_at = NULL');
    // The withdrawing provider's agreement goes back to a plain contact, so the owner may agree with
    // them again later (AYK-071).
    if (status === 'open') await conn.execute("UPDATE offers SET status = 'pending', accepted_at = NULL WHERE request_id = ? AND provider_id = ? AND status = 'accepted'", [id, request.assigned_provider_id]);
    if (status === 'cancelled') {
      fields.push('cancelled_at = CURRENT_TIMESTAMP');
      if (extra.cancellation_reason != null) {
        if (typeof extra.cancellation_reason !== 'string' || extra.cancellation_reason.length > 2000 || extra.cancellation_reason.includes('\0')) throw new ApiError('invalid_data', 422);
        fields.push('cancellation_reason = ?'); values.push(extra.cancellation_reason);
      }
      await conn.execute("UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending'", [id]);
    }
    await conn.execute(`UPDATE requests SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (status === 'completed') await conn.execute('UPDATE provider_profiles SET completed_orders = completed_orders + 1 WHERE user_id = ?', [request.assigned_provider_id]);
  });
  return findById(id);
}

async function softDelete(id, actor) {
  if (!actor || !Number.isSafeInteger(actor.id)) throw new ApiError('forbidden', 403);
  await transaction(async conn => {
    const [[request]] = await conn.query('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!request) throw new ApiError('request_not_found', 404);
    if (actor && !hasPermission(actor, 'requests.manage') && actor.id !== request.client_id) throw new ApiError('forbidden', 403);
    if (actor && !hasPermission(actor, 'requests.manage') && ['assigned', 'in_progress'].includes(request.status)) throw new ApiError('request_active', 409);
    const [[dispute]] = await conn.query("SELECT id FROM disputes WHERE request_id = ? AND status IN ('open','under_review','waiting_response','escalated') LIMIT 1", [id]);
    if (actor && !hasPermission(actor, 'requests.manage') && dispute) throw new ApiError('dispute_blocks_delete', 409);
    await conn.execute('UPDATE requests SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    await conn.execute("UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending'", [id]);
    await conn.execute('UPDATE location_shares SET is_live = 0 WHERE request_id = ?', [id]);
  });
}

// The administration's list (AYK-361): newest first, by status, region, city, profession and
// shown/hidden, and a search over the title, description, request number and the requester.
async function listAll({ page = 1, limit = 20, status, search, region_id, city_id, category_id, visibility } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  const id = value => optionalNumber(value, 1, 2147483647, true);
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (id(region_id)) { where.push('city.region_id = ?'); params.push(id(region_id)); }
  if (id(city_id)) { where.push('r.city_id = ?'); params.push(id(city_id)); }
  if (id(category_id)) { where.push('(r.category_id = ? OR svc.category_id = ?)'); params.push(id(category_id), id(category_id)); }
  if (visibility === 'hidden') where.push('r.hidden_at IS NOT NULL');
  else if (visibility === 'shown') where.push('r.hidden_at IS NULL');
  const text = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (text) {
    const s = `%${text}%`;
    const digits = /^\d{1,10}$/.test(text) ? Number(text) : null;
    where.push(`(r.title ILIKE ? OR r.description ILIKE ? OR u.full_name ILIKE ? OR u.phone LIKE ? OR u.referral_code = ?${digits ? ' OR r.id = ?' : ''})`);
    params.push(s, s, s, s, text, ...(digits ? [digits] : []));
  }
  const whereSql = where.join(' AND ');
  const items = await query(
    `SELECT ${BASE_SELECT}, u.phone AS client_phone, u.referral_code AS client_number, city.region_id AS region_id
     FROM requests r ${BASE_JOINS} WHERE ${whereSql}
     ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM requests r ${BASE_JOINS} WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

// Hides a request from providers, or shows it again (AYK-361).
async function setHidden(id, hidden) {
  id = optionalNumber(id, 1, 2147483647, true);
  if (id == null) throw new ApiError('invalid_id', 422);
  await query(`UPDATE requests SET hidden_at = ${hidden ? 'COALESCE(hidden_at, CURRENT_TIMESTAMP)' : 'NULL'}
    WHERE id = ? AND deleted_at IS NULL`, [id]);
  return queryOne('SELECT id, hidden_at FROM requests WHERE id = ? AND deleted_at IS NULL', [id]);
}

// AYK-440 (the owner: «بداية التشغيل… لا نريد الآخرين ما يجدون أحدًا»): the home board. Every open
// request (not the viewer's own, none hidden, none sent straight to another provider), ranked for the
// viewer: same profession AND same area first, then same area, then same profession, then the rest.
// `filterProfession` / `filterArea` keep only those (the buttons «مهنتي» / «حسب طلبي» and «منطقتي»;
// both off = no filter). The profession of a provider: their services' professions; of a requester:
// the professions they asked for. The area of a provider: their coverage districts (or coverage
// city); of a requester: their city.
// AYK-447: the sections a requester chose (users.interest_category_ids, a JSON list).
function interestIds(raw) {
  try { const list = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); return Array.isArray(list) ? [...new Set(list.map(Number).filter(n => Number.isSafeInteger(n) && n > 0))] : []; }
  catch (_) { return []; }
}

// AYK-440/442: what «مهنتي / حسب طلبي» and «منطقتي» mean for this person. A provider: the professions
// of his services and his coverage districts (else his city). A requester: the professions he asked
// for and his city.
async function boardViewer(viewerId, asProvider) {
  let categories = []; let services = []; let districts = []; let cityId = null;
  if (asProvider) {
    const profile = await queryOne(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS city_id
      FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = ?`, [viewerId]);
    const raw = profile?.service_ids;
    try { services = (Array.isArray(raw) ? raw : JSON.parse(raw || '[]') || []).map(Number).filter(Number.isSafeInteger); } catch (_) { services = []; }
    categories = services.length
      ? (await query(`SELECT DISTINCT category_id FROM services WHERE id IN (${services.map(() => '?').join(', ')})`, services)).map(row => Number(row.category_id)).filter(Boolean)
      : profile?.category_id ? [Number(profile.category_id)] : [];
    if (profile?.category_id && !categories.includes(Number(profile.category_id))) categories.push(Number(profile.category_id));
    districts = (await query('SELECT district_id FROM provider_coverage_districts WHERE user_id = ?', [viewerId])).map(row => Number(row.district_id));
    cityId = profile?.city_id ? Number(profile.city_id) : null;
  } else {
    categories = (await query('SELECT DISTINCT category_id FROM requests WHERE client_id = ? AND deleted_at IS NULL AND category_id IS NOT NULL', [viewerId])).map(row => Number(row.category_id));
    const me = await queryOne(`SELECT city_id, to_jsonb(u)->>'interest_category_ids' AS interests FROM users u WHERE id = ?`, [viewerId]);
    cityId = me?.city_id ? Number(me.city_id) : null;
    // AYK-447: the sections he chose before his first request count as what he asks for.
    for (const id of interestIds(me?.interests)) if (!categories.includes(id)) categories.push(id);
  }
  return { categories, services, districts, cityId };
}

// The SQL for «my profession» and «my area» over requests r.
function boardMatch({ categories, services, districts, cityId }) {
  const profParts = []; const profParams = [];
  if (categories.length) { profParts.push(`r.category_id IN (${categories.map(() => '?').join(', ')})`); profParams.push(...categories); }
  if (services.length) { profParts.push(`r.service_id IN (${services.map(() => '?').join(', ')})`); profParams.push(...services); }
  return {
    prof: profParts.length ? `(${profParts.join(' OR ')})` : 'FALSE', profParams,
    area: districts.length ? `r.district_id IN (${districts.map(() => '?').join(', ')})` : cityId ? 'r.city_id = ?' : 'FALSE',
    areaParams: districts.length ? districts : cityId ? [cityId] : [],
  };
}

async function findBoard({ viewerId, asProvider = false, filterProfession = false, filterArea = false, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  viewerId = Number(viewerId);
  // AYK-454 (the owner: «الطلب يظهر لصاحبه في الرئيسية… يشاهده الجميع بما فيهم صاحبه»): my own open
  // requests are on my board too, first.
  const where = ['r.deleted_at IS NULL', "r.status = 'open'", 'r.hidden_at IS NULL'];
  const params = [];
  where.push(asProvider ? '(r.direct_provider_id IS NULL OR r.direct_provider_id = ? OR r.client_id = ?)' : '(r.direct_provider_id IS NULL OR r.client_id = ?)');
  if (asProvider) params.push(viewerId, viewerId); else params.push(viewerId);
  const viewer = await boardViewer(viewerId, asProvider);
  const { categories } = viewer;
  const { prof, profParams, area, areaParams } = boardMatch(viewer);
  if (filterProfession) { where.push(prof); params.push(...profParams); }
  if (filterArea) { where.push(area); params.push(...areaParams); }
  const PREVIOUS = asProvider
    ? `EXISTS (SELECT 1 FROM requests p WHERE p.client_id = r.client_id AND p.assigned_provider_id = ? AND p.id <> r.id
         AND p.status IN (${PREVIOUS_CLIENT_STATUSES}) AND p.deleted_at IS NULL)` : 'FALSE';
  const candidates = `SELECT r.id, r.is_urgent, r.created_at, CASE WHEN r.client_id = ${Number(viewerId) || 0} THEN 1 ELSE 0 END AS mine,
      CASE WHEN ${prof} THEN 1 ELSE 0 END AS prof_match, CASE WHEN ${area} THEN 1 ELSE 0 END AS area_match,
      CASE WHEN ${PREVIOUS} THEN 1 ELSE 0 END AS previous_client
    FROM requests r WHERE ${where.join(' AND ')}`;
  const candidateParams = [...profParams, ...areaParams, ...(asProvider ? [viewerId] : []), ...params];
  const rows = await query(`SELECT id, prof_match, area_match, previous_client, COUNT(*) OVER () AS total FROM (${candidates}) board
    ORDER BY mine DESC, (prof_match * area_match) DESC, area_match DESC, prof_match DESC, previous_client DESC, is_urgent DESC, created_at DESC, id DESC
    LIMIT ? OFFSET ?`, [...candidateParams, Number(limit), Number(offset)]);
  let items = [];
  if (rows.length) {
    const ids = rows.map(row => row.id);
    const full = await query(`SELECT ${BASE_SELECT} FROM requests r ${BASE_JOINS} WHERE r.id IN (${ids.map(() => '?').join(', ')})`, ids);
    const byId = new Map(full.map(row => [Number(row.id), row]));
    items = rows.filter(row => byId.has(Number(row.id))).map(row => ({ ...byId.get(Number(row.id)),
      board_profession: Number(row.prof_match) === 1, board_area: Number(row.area_match) === 1,
      ...(asProvider ? { previous_client: Number(row.previous_client) === 1 } : {}) }));
  }
  const total = rows.length ? Number(rows[0].total) : offset === 0 ? 0
    : Number((await query(`SELECT COUNT(*) AS total FROM (${candidates}) board`, candidateParams))[0].total);
  // AYK-446: «مشابه لطلبي» (one request) or «مشابه لطلباتي» (more): how many requests the requester made.
  const myRequests = asProvider ? undefined : Number((await queryOne('SELECT COUNT(*) AS n FROM requests WHERE client_id = ? AND deleted_at IS NULL', [viewerId]))?.n || 0);
  const myInterests = asProvider ? undefined : interestIds((await queryOne(`SELECT to_jsonb(u)->>'interest_category_ids' AS v FROM users u WHERE id = ?`, [viewerId]))?.v).length;
  return { items, total, has_profession: categories.length > 0, has_area: areaParams.length > 0, my_requests: myRequests, my_interests: myInterests };
}

// AYK-441/442 (the owner: «إذا دخل العضو ولم يجد أحدًا خرج ولم يعد»؛ «أضف تم مؤخرًا ويختار قبل كم يوم،
// وكل المهن أو تقييد مهنة / تقييد منطقة؛ تذكر: المهنة، المدينة، وقت الاتفاق»): the requests agreed on
// lately with a service provider. Only the profession, the city and when the agreement was made: no
// title, no names, no numbers. Requests sent directly to one provider, hidden ones and the viewer's
// own are left out. `days`: how far back; «مهنتي» / «منطقتي» as on the board.
async function recentActivity({ viewerId = 0, asProvider = false, filterProfession = false, filterArea = false, days = 30, limit = 20 } = {}) {
  limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  days = Math.min(Math.max(Math.round(Number(days)) || 30, 1), 365);
  viewerId = Number(viewerId) || 0;
  const where = ['r.deleted_at IS NULL', 'r.hidden_at IS NULL', 'r.direct_provider_id IS NULL', 'r.assigned_provider_id IS NOT NULL',
    "r.status IN ('assigned', 'in_progress', 'completed', 'closed')", 'r.client_id <> ?'];
  const params = [viewerId];
  if (viewerId && (filterProfession || filterArea)) {
    const match = boardMatch(await boardViewer(viewerId, asProvider));
    if (filterProfession) { where.push(match.prof); params.push(...match.profParams); }
    if (filterArea) { where.push(match.area); params.push(...match.areaParams); }
  }
  const AGREED = 'COALESCE(r.agreed_at, o.accepted_at, r.completed_at, r.updated_at)';
  const rows = await query(`SELECT r.id, r.status, r.category_id, r.city_id, ${AGREED} AS agreed_at,
      cat.name_ar AS category_name, cat.name_en AS category_name_en, cat.name_translations AS category_name_translations,
      cat.icon AS category_icon, city.name_ar AS city_name, city.name_en AS city_name_en
    FROM requests r
    LEFT JOIN offers o ON o.id = r.accepted_offer_id
    LEFT JOIN categories cat ON r.category_id = cat.id
    LEFT JOIN cities city ON r.city_id = city.id
    WHERE ${where.join(' AND ')} AND ${AGREED} > CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
    ORDER BY ${AGREED} DESC, r.id DESC LIMIT ?`, [...params, days, limit]);
  return rows.map(row => ({ ...row, status: ['completed', 'closed'].includes(row.status) ? 'done' : 'working' }));
}

module.exports = { interestIds, create, updateByOwner, findById, incrementViews, findByClient, findNearby, findBoard, recentActivity, previousClients, updateStatus, setRemindersOff, softDelete, listAll, setHidden, pagination, optionalNumber, publicView, validateInput: validateCreate };
