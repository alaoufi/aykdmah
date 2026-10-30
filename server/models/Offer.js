const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const ProviderBadge = require('./ProviderBadge');
const Subscription = require('./Subscription');
const { assertMarketplaceWriteAccess } = require('../middleware/verificationPolicy');

const trustedBadgeSql = `EXISTS (SELECT 1 FROM provider_badges pb WHERE pb.user_id = pp.user_id AND pb.badge_type = 'trusted' AND pb.status = 'active' AND pb.ends_at > CURRENT_TIMESTAMP AND ${ProviderBadge.verifiedPaymentSql('pb')})`;
const featuredBadgeSql = `EXISTS (SELECT 1 FROM provider_badges pb WHERE pb.user_id = pp.user_id AND pb.badge_type = 'featured' AND pb.status = 'active' AND pb.ends_at > CURRENT_TIMESTAMP AND ${ProviderBadge.verifiedPaymentSql('pb')})`;
const featuredPlanSql = `EXISTS (SELECT 1 FROM subscriptions entitlement_sub JOIN subscription_plans entitlement_plan ON entitlement_plan.id = entitlement_sub.plan_id WHERE entitlement_sub.user_id = pp.user_id AND entitlement_plan.is_featured = 1 AND ${Subscription.validEntitlementSql('entitlement_sub', 'entitlement_plan')})`;

const OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];

function invalid(field) {
  throw new ApiError(`بيانات العرض غير صحيحة: ${field}`, 422);
}

function positiveId(value, field) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') invalid(field);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) invalid(field);
  return id;
}

function isEmpty(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function finiteNumber(value, field, min, max) {
  if (!['number', 'string'].includes(typeof value) || isEmpty(value)) invalid(field);
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) invalid(field);
  return number;
}

function optionalText(value, field, maxLength) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) invalid(field);
  return value.trim() || null;
}

function optionalDate(value) {
  if (isEmpty(value)) return null;
  if (typeof value !== 'string' || value.length > 40) invalid('available_from');
  const date = value.trim();
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(date);
  if (!parts) invalid('available_from');
  const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = parts;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number(year) < 1000 || calendar.getUTCFullYear() !== Number(year)
      || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day)
      || Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59
      || !Number.isFinite(Date.parse(date))) invalid('available_from');
  return new Date(date).toISOString();
}

function normalizeOffer(data) {
  // Arabic digits, the Arabic decimal mark and thousands commas are accepted as typed.
  const priceText = ['number', 'string'].includes(typeof data.price) ? String(data.price).trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٫]/g, '.').replace(/[,،٬\s]/g, '') : '';
  // A direct contact (no price; agreed in the chat) is stored as a zero-price offer.
  if (!data.contact && !/^\d+(?:\.\d{1,2})?$/.test(priceText)) invalid('price');
  const price = data.contact ? 0 : finiteNumber(priceText, 'price', 0.01, 99999999.99);
  if (isEmpty(data.latitude) !== isEmpty(data.longitude)) invalid('location');
  const latitude = isEmpty(data.latitude) ? null : finiteNumber(data.latitude, 'latitude', -90, 90);
  const longitude = isEmpty(data.longitude) ? null : finiteNumber(data.longitude, 'longitude', -180, 180);
  const accuracy = isEmpty(data.location_accuracy) ? null
    : finiteNumber(data.location_accuracy, 'location_accuracy', 0, 99999999.99);
  if (accuracy !== null && latitude === null) invalid('location_accuracy');
  return {
    request_id: positiveId(data.request_id, 'request_id'),
    provider_id: positiveId(data.provider_id, 'provider_id'),
    price,
    message: optionalText(data.message, 'message', 10000),
    estimated_duration: optionalText(data.estimated_duration, 'estimated_duration', 100),
    available_from: optionalDate(data.available_from),
    latitude,
    longitude,
    location_accuracy: accuracy,
  };
}

async function create(data) {
  const { request_id, provider_id, price, message, estimated_duration, available_from, latitude, longitude, location_accuracy } = normalizeOffer(data);
  const contact = Boolean(data.contact);
  return transaction(async (conn) => {
    const [[request]] = await conn.query('SELECT id, client_id, status, deleted_at FROM requests WHERE id = ? FOR UPDATE', [request_id]);
    if (!request || request.deleted_at) throw new ApiError('الطلب غير موجود', 404);
    if (request.status !== 'open') throw new ApiError('الطلب لم يعد متاحًا للعروض', 409);
    if (request.client_id === provider_id) throw new ApiError('لا يمكنك تقديم عرض على طلبك', 403);
    // The provider lock also serializes submissions to different requests so
    // one monthly quota slot cannot be consumed by two concurrent offers.
    const [[provider]] = await conn.query('SELECT id, role, is_active, is_blocked, deleted_at FROM users WHERE id = ? FOR UPDATE', [provider_id]);
    if (!provider || provider.role !== 'provider' || !provider.is_active || provider.is_blocked || provider.deleted_at) {
      throw new ApiError('حساب مقدم الخدمة غير متاح', 403);
    }
    await assertMarketplaceWriteAccess(provider_id, { query: async (sql, params) => (await conn.query(sql, params))[0] });
    const [[existing]] = await conn.query('SELECT id, status FROM offers WHERE request_id = ? AND provider_id = ?', [request_id, provider_id]);
    // Contacting again reopens the same conversation.
    if (existing && contact && existing.status === 'pending') return existing.id;
    // A provider who withdrew may come back while the request is open (AYK-080).
    if (existing && contact && existing.status === 'withdrawn') {
      await conn.query("UPDATE offers SET status = 'pending' WHERE id = ?", [existing.id]);
      return existing.id;
    }
    if (existing) throw new ApiError('تم تقديم عرض على هذا الطلب مسبقًا', 409);
    const [[entitlement]] = await conn.query(`SELECT p.max_offers_per_month FROM subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = ? AND ${Subscription.validEntitlementSql('s', 'p')}
      ORDER BY s.created_at DESC, s.id DESC LIMIT 1 FOR SHARE OF s, p`, [provider_id]);
    if (!contact && entitlement?.max_offers_per_month != null) {
      const maximum = Number(entitlement.max_offers_per_month);
      if (!Number.isSafeInteger(maximum) || maximum < 0) throw new ApiError('حد العروض الشهري غير متاح', 409);
      // Count every submission, including rejected/withdrawn bids and bids on
      // deleted requests. Changing a bid's status cannot refill the quota.
      const [[usage]] = await conn.query(`SELECT COUNT(*) AS total FROM offers WHERE provider_id = ?
        AND created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        AND created_at < date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month'`, [provider_id]);
      if (Number(usage.total) >= maximum) throw new ApiError('تم بلوغ الحد الشهري للعروض في باقتك', 409);
    }
    const [[configuredMaximum]] = await conn.query("SELECT setting_value FROM settings WHERE setting_key = 'max_offers_per_request'");
    const configuredLimit = Number(configuredMaximum?.setting_value);
    const requestLimit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20;
    const [[requestUsage]] = await conn.query('SELECT COUNT(*) AS total FROM offers WHERE request_id = ?', [request_id]);
    if (Number(requestUsage.total) >= requestLimit) throw new ApiError('تم بلوغ الحد الأقصى للعروض على هذا الطلب', 409);
    const [result] = await conn.execute(
      `INSERT INTO offers (request_id, provider_id, price, message, estimated_duration, available_from, latitude, longitude, location_accuracy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`,
      [
        request_id, provider_id, price,
        message, estimated_duration, available_from,
        latitude, longitude, location_accuracy,
      ]
    );
    await conn.execute(
      'UPDATE requests SET offers_count = offers_count + 1 WHERE id = ?',
      [request_id]
    );
    return result.insertId;
  });
}

async function findById(id) {
  id = positiveId(id, 'offer_id');
  return queryOne(
    `SELECT o.*, u.full_name AS provider_name, u.avatar AS provider_avatar,
            u.is_verified AS provider_verified,
            pp.rating_avg, pp.rating_count, pp.completed_orders, pp.location_mode, CASE WHEN ${featuredPlanSql} THEN 1 ELSE 0 END AS is_featured
     FROM offers o
     JOIN users u ON o.provider_id = u.id
     LEFT JOIN provider_profiles pp ON pp.user_id = u.id
     WHERE o.id = ?`,
    [id]
  );
}

async function findByRequest(requestId, { providerId } = {}) {
  requestId = positiveId(requestId, 'request_id');
  const params = [requestId];
  if (providerId !== undefined) params.push(positiveId(providerId, 'provider_id'));
  return query(
    `SELECT o.*, u.full_name AS provider_name, u.avatar AS provider_avatar,
            u.is_verified AS provider_verified,
            pp.rating_avg, pp.rating_count, pp.completed_orders, pp.location_mode, CASE WHEN ${featuredPlanSql} THEN 1 ELSE 0 END AS is_featured,
            CASE WHEN ${trustedBadgeSql} THEN 1 ELSE 0 END AS badge_trusted_active, pp.badge_trusted_until,
            CASE WHEN ${featuredBadgeSql} THEN 1 ELSE 0 END AS badge_featured_active, pp.badge_featured_until,
            COALESCE(sp.search_priority, 0) AS plan_priority,
            sp.name_ar AS plan_name, sp.name_en AS plan_name_en, sp.badge AS plan_badge
     FROM offers o
     JOIN users u ON o.provider_id = u.id
     LEFT JOIN provider_profiles pp ON pp.user_id = u.id
     LEFT JOIN subscriptions s
            ON s.id = pp.current_subscription_id
           AND s.user_id = pp.user_id
     LEFT JOIN subscription_plans sp ON sp.id = s.plan_id AND ${Subscription.validEntitlementSql('s', 'sp')}
     WHERE o.request_id = ? ${providerId !== undefined ? 'AND o.provider_id = ?' : ''}
     ORDER BY
       -- 1) Any paid badge (Trusted OR Featured) bubbles to the top.
       (CASE WHEN ${trustedBadgeSql} OR ${featuredBadgeSql} THEN 1 ELSE 0 END) DESC,
       -- 2) Among the rest, subscription plan priority decides.
       plan_priority DESC,
       -- 3) Natural ranking by rating average, then volume, then recency.
       COALESCE(pp.rating_avg, 0) DESC,
       COALESCE(pp.rating_count, 0) DESC,
       o.created_at ASC`,
    params
  );
}

async function findByProvider(providerId, { status, scope, page = 1, limit = 20 } = {}) {
  providerId = positiveId(providerId, 'provider_id');
  page = positiveId(page, 'page');
  limit = positiveId(limit, 'limit');
  if (page > 1000000 || limit > 100) invalid('pagination');
  if (status && !OFFER_STATUSES.includes(status)) invalid('status');
  if (scope && !['active', 'archive'].includes(scope)) invalid('scope');
  const offset = (page - 1) * limit;
  const where = ['o.provider_id = ?', 'r.deleted_at IS NULL'];
  const params = [providerId];
  // "Active" tasks still need the provider; the archive keeps everything else (AYK-075).
  const active = `(r.status IN ('open', 'assigned', 'in_progress') AND o.status IN ('pending', 'accepted') AND (r.assigned_provider_id IS NULL OR r.assigned_provider_id = ?))`;
  if (scope === 'active') { where.push(active); params.push(providerId); }
  else if (scope === 'archive') { where.push(`NOT ${active}`); params.push(providerId); }
  else {
    // A finished task (or one agreed with someone else) leaves a day later (AYK-041).
    where.push(`NOT (r.client_id <> ? AND (r.status IN ('completed', 'closed', 'cancelled') OR (r.assigned_provider_id IS NOT NULL AND r.assigned_provider_id <> ?)) AND COALESCE(r.completed_at, r.updated_at) < CURRENT_TIMESTAMP - INTERVAL '1 day')`);
    params.push(providerId, providerId);
  }
  if (status) { where.push('o.status = ?'); params.push(status); }
  const whereSql = where.join(' AND ');

  const items = await query(
    `SELECT o.*, r.title AS request_title, r.status AS request_status
     FROM offers o JOIN requests r ON o.request_id = r.id
     WHERE ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM offers o JOIN requests r ON o.request_id = r.id WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

async function transitionOffer(offerId, clientId, status) {
  offerId = positiveId(offerId, 'offer_id');
  const hasActor = clientId !== undefined;
  if (hasActor) clientId = positiveId(clientId, 'client_id');
  return transaction(async (conn) => {
    // Discover the request without locking an offer. Every mutation locks the
    // request first so concurrent acceptance cannot deadlock on rival offers.
    const [[reference]] = await conn.query('SELECT request_id FROM offers WHERE id = ?', [offerId]);
    if (!reference) throw new ApiError('العرض غير موجود', 404);
    const [[request]] = await conn.query('SELECT id, client_id, status, deleted_at FROM requests WHERE id = ? FOR UPDATE', [reference.request_id]);
    if (!request || request.deleted_at) throw new ApiError('الطلب غير موجود', 404);
    if (hasActor && request.client_id !== clientId) throw new ApiError('لا تملك صلاحية للوصول', 403);
    const [[offer]] = await conn.query('SELECT * FROM offers WHERE id = ? FOR UPDATE', [offerId]);
    if (!offer) throw new ApiError('العرض غير موجود', 404);
    if (offer.request_id !== request.id || offer.status !== 'pending' || request.status !== 'open') {
      throw new ApiError('الطلب أو العرض لم يعد متاحًا للقبول', 409);
    }
    if (!hasActor) invalid('client_id');
    if (status === 'rejected') {
      await conn.execute("UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'", [offerId]);
      return { ...offer, status: 'rejected' };
    }
    if (offer.provider_id === request.client_id) throw new ApiError('لا يمكنك قبول عرضك', 403);
    const [parties] = await conn.query('SELECT id, role, is_active, is_blocked, deleted_at FROM users WHERE id IN (?, ?) ORDER BY id FOR SHARE', [clientId, offer.provider_id]);
    const provider = parties.find(user => user.id === offer.provider_id);
    if (!provider || provider.role !== 'provider' || !provider.is_active || provider.is_blocked || provider.deleted_at) {
      throw new ApiError('حساب مقدم الخدمة غير متاح', 409);
    }
    const policyQuery = async (sql, params) => (await conn.query(sql, params))[0];
    await assertMarketplaceWriteAccess(clientId, { query: policyQuery });
    await assertMarketplaceWriteAccess(offer.provider_id, { query: policyQuery });
    await conn.execute(
      "UPDATE offers SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [offerId]
    );
    await conn.execute(
      "UPDATE offers SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP WHERE request_id = ? AND id != ? AND status = 'pending'",
      [offer.request_id, offerId]
    );
    await conn.execute(
      "UPDATE requests SET status = 'assigned', assigned_provider_id = ?, accepted_offer_id = ? WHERE id = ?",
      [offer.provider_id, offerId, offer.request_id]
    );
    return { ...offer, status: 'accepted' };
  });
}

async function acceptOffer(offerId, clientId) {
  return transitionOffer(offerId, clientId, 'accepted');
}

async function rejectOffer(offerId, clientId) {
  await transitionOffer(offerId, clientId, 'rejected');
  return findById(offerId);
}

async function updateStatus(id, status, clientId) {
  if (status !== 'rejected') throw new ApiError('حالة العرض غير صحيحة', 422);
  return rejectOffer(id, clientId);
}

module.exports = { create, findById, findByRequest, findByProvider, updateStatus, acceptOffer, rejectOffer };
