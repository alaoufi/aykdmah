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
  for (const key of ['address', 'latitude', 'longitude', 'files', 'assigned_provider_id', 'accepted_offer_id', 'assigned_provider_name', 'direct_provider_id']) delete view[key];
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
  ap.full_name AS assigned_provider_name,
  u.full_name AS client_name, u.avatar AS client_avatar,
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
    // Without an area the request cannot reach providers (AYK-044).
    if (!location.city_id) throw new ApiError('request_location_required', 422);
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

async function findByClient(clientId, { status, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = ['r.client_id = ?', 'r.deleted_at IS NULL'];
  const params = [clientId];
  if (status) { where.push('r.status = ?'); params.push(status); }
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

async function findNearby({ latitude, longitude, radiusKm = 25, categoryId, serviceId, status = 'open', page = 1, limit = 20, providerId = null } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  if (status !== 'open') throw new ApiError('invalid_status', 422);
  latitude = optionalNumber(latitude, -90, 90); longitude = optionalNumber(longitude, -180, 180);
  if ((latitude == null) !== (longitude == null)) throw new ApiError('invalid_coordinates', 422);
  radiusKm = optionalNumber(radiusKm, 0.1, 250);
  if (radiusKm == null) radiusKm = 25;
  categoryId = optionalNumber(categoryId, 1, 2147483647, true); serviceId = optionalNumber(serviceId, 1, 2147483647, true);
  // A direct contact from the requester's directory is not on the board (AYK-041).
  const where = ['r.deleted_at IS NULL', 'r.status = ?', 'r.direct_provider_id IS NULL'];
  const whereParams = [status];
  if (categoryId) { where.push('r.category_id = ?'); whereParams.push(categoryId); }
  if (serviceId) { where.push('r.service_id = ?'); whereParams.push(serviceId); }
  if (providerId) {
    // "Matching me": the provider's registered services and coverage area.
    // Without a coverage city the provider's own city is their area.
    const profile = await queryOne(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS coverage_city_id
      FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = ?`, [providerId]);
    let services = [];
    try { services = (JSON.parse(profile?.service_ids || '[]') || []).map(Number).filter(Number.isSafeInteger); } catch (_) { services = []; }
    const categories = services.length
      ? (await query(`SELECT DISTINCT category_id FROM services WHERE id IN (${services.map(() => '?').join(', ')})`, services)).map(row => Number(row.category_id))
      : profile?.category_id ? [Number(profile.category_id)] : [];
    const match = [];
    if (services.length) { match.push(`r.service_id IN (${services.map(() => '?').join(', ')})`); whereParams.push(...services); }
    if (categories.length) { match.push(`(r.service_id IS NULL AND r.category_id IN (${categories.map(() => '?').join(', ')}))`); whereParams.push(...categories); }
    if (match.length) where.push(`(${match.join(' OR ')})`);
    const covered = await query('SELECT district_id FROM provider_coverage_districts WHERE user_id = ?', [providerId]);
    if (covered.length) {
      where.push(`r.district_id IN (${covered.map(() => '?').join(', ')})`); whereParams.push(...covered.map(row => Number(row.district_id)));
    } else if (profile?.coverage_city_id) {
      where.push('r.city_id = ?'); whereParams.push(Number(profile.coverage_city_id));
    }
  }

  const hasGeo = latitude != null && longitude != null;
  let distanceSelect = '';
  const orderParts = [];
  if (hasGeo) {
    distanceSelect = `,
      CASE WHEN r.latitude IS NULL OR r.longitude IS NULL THEN NULL ELSE (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(?)) * cos(radians(ROUND(r.latitude, 2))) *
        cos(radians(ROUND(r.longitude, 2)) - radians(?)) +
        sin(radians(?)) * sin(radians(ROUND(r.latitude, 2)))
      )))) END AS distance_km`;
    orderParts.push('distance_km ASC');
  }
  orderParts.push('r.is_urgent DESC', 'r.created_at DESC');

  const itemsSql = `
    SELECT ${BASE_SELECT}${distanceSelect}
    FROM requests r ${BASE_JOINS}
    WHERE ${where.join(' AND ')}
  `;
  const filteredItemsSql = `SELECT * FROM (${itemsSql}) nearby
    ${hasGeo ? 'WHERE distance_km IS NULL OR distance_km <= ?' : ''}
    ORDER BY ${orderParts.map(part => part.replace(/r\./g, '')).join(', ')}
    LIMIT ? OFFSET ?
  `;
  const itemsParams = hasGeo
    ? [latitude, longitude, latitude, ...whereParams, radiusKm, Number(limit), Number(offset)]
    : [...whereParams, Number(limit), Number(offset)];

  const items = await query(filteredItemsSql, itemsParams);

  const countSql = hasGeo
    ? `SELECT COUNT(*) AS total FROM (
         SELECT r.id,
           CASE WHEN r.latitude IS NULL OR r.longitude IS NULL THEN NULL ELSE (6371 * acos(LEAST(1, GREATEST(-1,
             cos(radians(?)) * cos(radians(ROUND(r.latitude, 2))) *
             cos(radians(ROUND(r.longitude, 2)) - radians(?)) +
             sin(radians(?)) * sin(radians(ROUND(r.latitude, 2)))
           )))) END AS distance_km
         FROM requests r
         WHERE ${where.join(' AND ')}
       ) t WHERE distance_km IS NULL OR distance_km <= ?`
    : `SELECT COUNT(*) AS total FROM requests r WHERE ${where.join(' AND ')}`;
  const countParams = hasGeo
    ? [latitude, longitude, latitude, ...whereParams, radiusKm]
    : whereParams;
  const [{ total }] = await query(countSql, countParams);
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
    const transitions = {
      open: ['assigned', 'cancelled'], assigned: ['in_progress', 'completed', 'cancelled'],
      in_progress: ['completed', 'cancelled'], completed: ['closed'], cancelled: ['closed'], closed: [],
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
      fields.push('assigned_provider_id = ?', 'accepted_offer_id = NULL'); values.push(providerId);
      await conn.execute("UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending'", [id]);
    }
    if (status === 'completed') fields.push('completed_at = CURRENT_TIMESTAMP');
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

async function listAll({ page = 1, limit = 20, status, search } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (search) {
    where.push('(r.title LIKE ? OR r.description LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s);
  }
  const whereSql = where.join(' AND ');
  const items = await query(
    `SELECT ${BASE_SELECT} FROM requests r ${BASE_JOINS} WHERE ${whereSql}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM requests r WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

module.exports = { create, findById, incrementViews, findByClient, findNearby, updateStatus, setRemindersOff, softDelete, listAll, pagination, optionalNumber, publicView, validateInput: validateCreate };
