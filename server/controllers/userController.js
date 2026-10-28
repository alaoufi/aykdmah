const User = require('../models/User');
const Review = require('../models/Review');
const { success, created, error, notFound, paginate, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { hashPassword } = require('../utils/hash');
const { validateUserLocation, booleanIntent, locationChanged, isCompleteAccountProfile, requireCompleteAccountProfile } = require('../utils/userLocation');
const { validateProviderServices } = require('../utils/providerServices');
const { validateCoverage, saveCoverage } = require('../utils/providerCoverage');
const { validateAvailability } = require('../utils/providerAvailability');
const { hasPermission } = require('../middleware/roleCheck');
const { queryOne, query } = require('../config/database');
const pick = (object, fields) => Object.fromEntries(fields.filter(key => object[key] !== undefined).map(key => [key, object[key]]));
const PUBLIC_USER_FIELDS = ['id', 'full_name', 'role', 'avatar', 'is_verified', 'is_online', 'city_id', 'district_id', 'country_id', 'region_id', 'governorate_id', 'city_name', 'city_name_ar', 'city_name_en', 'district_name', 'district_name_ar', 'district_name_en', 'governorate_name', 'governorate_name_ar', 'governorate_name_en', 'region_name', 'region_name_ar', 'region_name_en', 'country_name', 'country_name_ar', 'country_name_en'];
const PUBLIC_PROVIDER_FIELDS = ['id', 'user_id', 'business_name', 'bio', 'experience_years', 'category_id', 'service_ids', 'service_radius_km', 'hourly_rate', 'cover_image', 'gallery', 'rating_avg', 'rating_count', 'completed_orders', 'is_trusted', 'is_featured_badge', 'location_mode', 'fixed_address', 'show_location_on_map', 'coverage_city_id', 'coverage_districts', 'availability'];
const validImageUrl = value => value === null || value === '' || (typeof value === 'string' && value.length <= 255 && /^(?:https?:\/\/|\/(?!\/))/i.test(value) && !/[\u0000-\u0020]/.test(value));

function disconnectUser(req, id) {
  const io = req.app.get('io');
  if (io) io.in(`user:${id}`).disconnectSockets(true);
}

const list = asyncHandler(async (req, res) => {
  const { role, search } = req.query;
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
  const { items, total } = await User.listPaginated({ role, search, page, limit });
  return paginate(res, items, total, page, limit);
});

const getOne = asyncHandler(async (req, res) => {
  let user = await User.findById(req.params.id);
  if (!user) return notFound(res);
  const privateAccess = Number(req.user?.id) === Number(user.id) || hasPermission(req.user, 'users.manage');
  if (!privateAccess && (!user.is_active || user.is_blocked || user.role === 'admin')) return notFound(res);
  let provider = null;
  if (user.role === 'provider') {
    provider = await User.getProviderProfile(user.id);
  }
  if (!privateAccess) {
    user = pick(user, PUBLIC_USER_FIELDS);
    const fullProvider = provider;
    if (provider) provider = pick(provider, PUBLIC_PROVIDER_FIELDS);
    // The exact work location is public only when the provider opted in to the map.
    if (provider && Number(fullProvider.show_location_on_map) === 1 && fullProvider.location_mode !== 'mobile'
        && fullProvider.fixed_latitude != null && fullProvider.fixed_longitude != null) {
      provider.fixed_latitude = Number(fullProvider.fixed_latitude);
      provider.fixed_longitude = Number(fullProvider.fixed_longitude);
    }
  }
  return success(res, { user, provider });
});

const updateMe = asyncHandler(async (req, res) => {
  const current = await User.findById(req.user.id);
  const payload = { ...req.body };
  if (payload.avatar !== undefined && !validImageUrl(payload.avatar)) return error(res, req.t('invalid_data'), 400);
  if (payload.phone !== undefined) {
    if (payload.phone !== null && typeof payload.phone !== 'string') return error(res, req.t('invalid_data'), 400);
    payload.phone = String(payload.phone || '').trim().replace(/[\s()-]/g, '') || null;
    if (payload.phone && (payload.phone.length > 30 || !/^[+\d\s()-]+$/.test(payload.phone))) return error(res, req.t('invalid_data'), 400);
    const other = payload.phone && await User.findByPhone(payload.phone);
    if (other && Number(other.id) !== Number(req.user.id)) return error(res, req.t('phone_taken'), 409);
  }
  if (payload.full_name !== undefined) {
    if (typeof payload.full_name !== 'string') return error(res, req.t('invalid_data'), 400);
    payload.full_name = payload.full_name.trim();
    if (payload.full_name.length < 2 || payload.full_name.length > 150) return error(res, req.t('invalid_data'), 400);
  }
  const location = await validateUserLocation(req.body, current, req.t('invalid_data'));
  Object.assign(payload, location);
  const completingProfile = booleanIntent(payload.complete_profile, req.t('invalid_data'));
  const contactChanged = (payload.full_name !== undefined && payload.full_name !== String(current.full_name || '').trim()) ||
    (payload.phone !== undefined && payload.phone !== (String(current.phone || '').trim().replace(/[\s()-]/g, '') || null));
  if (completingProfile || ((contactChanged || locationChanged(location, current)) && await isCompleteAccountProfile(current))) {
    await requireCompleteAccountProfile({ ...current, ...payload }, req.t('account_profile_required'), { confirmed: completingProfile });
  }
  let user;
  try { user = await User.update(req.user.id, payload); }
  catch (err) {
    if (err.code === '23505' && String(err.constraint || '').includes('phone')) return error(res, req.t('phone_taken'), 409);
    throw err;
  }
  return success(res, user, req.t('profile_updated'));
});

const updateProvider = asyncHandler(async (req, res) => {
  if (req.user.role !== 'provider' && req.user.role !== 'admin') {
    return forbidden(res);
  }
  if (req.user.role === 'admin' && !hasPermission(req.user, 'users.manage')) return forbidden(res);
  const userId = req.user.role === 'admin' && req.body.user_id ? req.body.user_id : req.user.id;
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return error(res, req.t('invalid_data'), 400);
  const target = await User.findById(userId);
  if (!target || target.role !== 'provider') return notFound(res);
  const payload = { ...req.body };
  const currentProfile = await User.getProviderProfile(userId);
  // A provider always keeps at least one profession (AYK-027).
  if (payload.any_category === true && Array.isArray(payload.service_ids) && payload.service_ids.length === 0) return error(res, req.t('provider_services_required'), 400);
  Object.assign(payload, await validateProviderServices(payload, currentProfile || {}, { message: req.t('invalid_data') }));
  if (payload.cover_image !== undefined && !validImageUrl(payload.cover_image)) return error(res, req.t('invalid_data'), 400);
  if (payload.show_location_on_map !== undefined) {
    if (![0, 1, true, false, '0', '1'].includes(payload.show_location_on_map)) return error(res, req.t('invalid_data'), 400);
    payload.show_location_on_map = [1, true, '1'].includes(payload.show_location_on_map) ? 1 : 0;
  }
  if (payload.location_mode !== undefined && !['fixed', 'mobile', 'both'].includes(payload.location_mode)) return error(res, req.t('invalid_data'), 400);
  if (payload.service_radius_km !== undefined && (!Number.isFinite(Number(payload.service_radius_km)) || Number(payload.service_radius_km) < 1 || Number(payload.service_radius_km) > 200)) return error(res, req.t('invalid_data'), 400);
  for (const [field, max] of [['business_name', 200], ['bio', 10000], ['fixed_address', 255], ['cover_image', 255]]) {
    if (payload[field] !== undefined && payload[field] !== null && (typeof payload[field] !== 'string' || payload[field].length > max)) return error(res, req.t('invalid_data'), 400);
  }
  for (const [field, max] of [['experience_years', 100], ['hourly_rate', 10000000]]) {
    if (payload[field] !== undefined && payload[field] !== null && (!['number', 'string'].includes(typeof payload[field]) || !Number.isFinite(Number(payload[field])) || Number(payload[field]) < 0 || Number(payload[field]) > max)) return error(res, req.t('invalid_data'), 400);
  }
  if (payload.gallery !== undefined && (!Array.isArray(payload.gallery) || payload.gallery.length > 30 || payload.gallery.some(url => !validImageUrl(url) || !url))) return error(res, req.t('invalid_data'), 400);
  if (payload.fixed_latitude !== undefined || payload.fixed_longitude !== undefined) {
    const current = await User.getProviderProfile(userId);
    const point = await validateUserLocation({
      ...(payload.fixed_latitude !== undefined ? { latitude: payload.fixed_latitude } : {}),
      ...(payload.fixed_longitude !== undefined ? { longitude: payload.fixed_longitude } : {}),
    }, { latitude: current?.fixed_latitude, longitude: current?.fixed_longitude }, req.t('invalid_data'));
    payload.fixed_latitude = point.latitude;
    payload.fixed_longitude = point.longitude;
  }
  if ((payload.location_mode ?? currentProfile?.location_mode) === 'mobile') {
    payload.fixed_latitude = null;
    payload.fixed_longitude = null;
    payload.fixed_address = null;
  }
  Object.assign(payload, validateAvailability(payload, req.t('invalid_data')));
  const coverage = await validateCoverage(payload, { cityId: currentProfile?.coverage_city_id || target.city_id, message: req.t('invalid_data') });
  if (payload.also_client !== undefined && ![true, false, 0, 1, '0', '1'].includes(payload.also_client)) return error(res, req.t('invalid_data'), 400);
  if (coverage) await saveCoverage(query, userId, coverage);
  if (payload.also_client !== undefined) await query('UPDATE users SET also_client = ? WHERE id = ?', [[true, 1, '1'].includes(payload.also_client) ? 1 : 0, userId]);
  const profile = await User.updateProviderProfile(userId, payload);
  return success(res, profile, req.t('provider_updated'));
});

const getProviderReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { items, total } = await Review.findByProvider(req.params.id, { page, limit });
  return paginate(res, items, total, page, limit);
});

const block = asyncHandler(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    return error(res, req.t('cannot_block_self'));
  }
  if (!await User.setBlocked(req.params.id, true, req.user)) return notFound(res);
  disconnectUser(req, req.params.id);
  return success(res, null, req.t('user_blocked'));
});

const unblock = asyncHandler(async (req, res) => {
  if (!await User.setBlocked(req.params.id, false, req.user)) return notFound(res);
  disconnectUser(req, req.params.id);
  return success(res, null, req.t('user_unblocked'));
});

const remove = asyncHandler(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    return error(res, req.t('cannot_delete_self'));
  }
  if (!await User.softDelete(req.params.id, req.user)) return notFound(res);
  disconnectUser(req, req.params.id);
  return success(res, null, req.t('user_deleted'));
});

const createByAdmin = asyncHandler(async (req, res) => {
  const { full_name, username, email, phone, facebook_id, password, role } = req.body;
  if (!full_name || !password || !role) return error(res, req.t('invalid_data'));
  if (!['client', 'provider', 'admin'].includes(role)) return error(res, req.t('invalid_data'), 400);
  if (role === 'admin' && !hasPermission(req.user, 'admins.manage')) return forbidden(res);
  // Need at least one identifier
  if (!username && !email && !phone && !facebook_id) return error(res, req.t('need_one_identifier'));

  if (email && await User.findByEmail(email)) return error(res, req.t('email_taken'));
  if (phone && await User.findByPhone(phone)) return error(res, req.t('phone_taken'));
  if (username && await User.findByUsername(username)) return error(res, req.t('username_taken'));
  if (facebook_id && await User.findByFacebookId(facebook_id)) return error(res, req.t('facebook_taken'));

  const password_hash = await hashPassword(password);
  const location = await validateUserLocation(req.body, {}, req.t('invalid_data'));
  let id;
  try { id = await User.create({
    full_name, username: username || null, email: email || null,
    phone: phone || null, facebook_id: facebook_id || null,
    password_hash, role,
    ...location,
    is_active: req.body.is_active,
  }); } catch (err) {
    if (err.code === '23505') return error(res, req.t('invalid_data'), 409);
    throw err;
  }
  const user = await User.findById(id);
  return created(res, user, req.t('account_created'));
});

const updateByAdmin = asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (data.avatar !== undefined && !validImageUrl(data.avatar)) return error(res, req.t('invalid_data'), 400);
  delete data.password_hash;
  if (data.password) {
    data.password_hash = await hashPassword(data.password);
    delete data.password;
  }
  if (data.is_blocked !== undefined) data.is_blocked = data.is_blocked === true || data.is_blocked === 1 ? 1 : 0;
  if (data.is_active !== undefined) data.is_active = data.is_active === true || data.is_active === 1 ? 1 : 0;
  if (data.is_verified !== undefined) data.is_verified = data.is_verified === true || data.is_verified === 1 ? 1 : 0;
  const current = await User.findById(req.params.id);
  if (!current) return notFound(res);
  Object.assign(data, await validateUserLocation(req.body, current, req.t('invalid_data')));
  let user;
  try { user = await User.adminUpdate(req.params.id, data, req.user); }
  catch (err) {
    if (err.code === '23505') return error(res, req.t('invalid_data'), 409);
    throw err;
  }
  if (!user) return notFound(res);
  if (['password_hash', 'role', 'is_active', 'is_blocked', 'email', 'phone', 'username', 'facebook_id'].some(key => data[key] !== undefined)) disconnectUser(req, req.params.id);
  return success(res, user, req.t('profile_updated'));
});

// PUT /users/me/role { role: client | provider | both, service_ids, coverage_district_ids, location_mode, fixed_latitude, fixed_longitude }
// Lets an account fix the type chosen at sign-up. Work in progress is never
// orphaned: a provider with assigned jobs cannot leave, and a client with open
// requests can only move to "both". A former provider's profile is kept and reused.
const ACTIVE_REQUEST = ['open', 'assigned', 'in_progress'];
const changeRole = asyncHandler(async (req, res) => {
  const target = req.body.role;
  if (!['client', 'provider', 'both'].includes(target)) return error(res, req.t('type_invalid'), 400);
  const user = await queryOne(`SELECT id, role, to_jsonb(users)->>'also_client' AS also_client, city_id FROM users WHERE id = ? AND deleted_at IS NULL`, [req.user.id]);
  if (!user || !['client', 'provider'].includes(user.role)) return forbidden(res);
  const current = user.role === 'client' ? 'client' : Number(user.also_client) === 1 ? 'both' : 'provider';
  if (current === target) return success(res, await User.findById(user.id), req.t('updated'));

  const placeholders = ACTIVE_REQUEST.map(() => '?').join(', ');
  if (target === 'client') {
    const job = await queryOne(`SELECT id FROM requests WHERE assigned_provider_id = ? AND status IN ('assigned', 'in_progress') AND deleted_at IS NULL LIMIT 1`, [user.id]);
    if (job) return error(res, req.t('role_change_active_jobs'), 409);
  }
  if (target === 'provider' && current !== 'provider') {
    const own = await queryOne(`SELECT id FROM requests WHERE client_id = ? AND status IN (${placeholders}) AND deleted_at IS NULL LIMIT 1`, [user.id, ...ACTIVE_REQUEST]);
    if (own) return error(res, req.t('role_change_open_requests'), 409);
  }

  // Becoming a provider needs the same work details as a provider sign-up,
  // unless an earlier provider profile already holds them.
  let profile = null;
  if (target !== 'client' && user.role === 'client') {
    const existing = await User.getProviderProfile(user.id);
    const hasServices = Array.isArray(existing?.service_ids) ? existing.service_ids.length > 0 : Boolean(existing?.service_ids);
    const supplied = req.body.service_ids !== undefined;
    if (!existing || !hasServices || supplied) {
      const mode = req.body.location_mode === undefined ? 'mobile' : req.body.location_mode;
      if (!['fixed', 'mobile', 'both'].includes(mode)) return error(res, req.t('invalid_data'), 400);
      profile = { location_mode: mode, fixed_latitude: null, fixed_longitude: null };
      if (mode !== 'mobile') {
        const point = await validateUserLocation({ latitude: req.body.fixed_latitude, longitude: req.body.fixed_longitude }, {}, req.t('invalid_data'));
        if (point.latitude == null || point.longitude == null) return error(res, req.t('provider_venue_point_required'), 400);
        profile.fixed_latitude = point.latitude;
        profile.fixed_longitude = point.longitude;
      }
      Object.assign(profile, await validateProviderServices({ service_ids: req.body.service_ids, any_category: true }, {}, {
        required: true, message: req.t('provider_services_required'),
      }));
      profile.coverage = await validateCoverage(req.body, { cityId: user.city_id, required: true, message: req.t('provider_area_required') });
    }
  }

  const { transaction } = require('../config/database');
  await transaction(async conn => {
    if (target === 'client') {
      // Pending bids from an account that no longer provides services are withdrawn.
      await conn.execute(`UPDATE offers SET status = 'withdrawn' WHERE provider_id = ? AND status = 'pending'`, [user.id]);
      await conn.execute(`UPDATE users SET role = 'client', also_client = 0 WHERE id = ?`, [user.id]);
      return;
    }
    await conn.execute(`UPDATE users SET role = 'provider', also_client = ? WHERE id = ?`, [target === 'both' ? 1 : 0, user.id]);
    if (!profile) return;
    const [[row]] = await conn.query('SELECT id FROM provider_profiles WHERE user_id = ?', [user.id]);
    const values = [profile.location_mode, profile.fixed_latitude, profile.fixed_longitude, profile.category_id ?? null,
      profile.service_ids ? JSON.stringify(profile.service_ids) : null];
    if (row) {
      await conn.execute(`UPDATE provider_profiles SET location_mode = ?, fixed_latitude = ?, fixed_longitude = ?, category_id = ?, service_ids = ? WHERE user_id = ?`, [...values, user.id]);
    } else {
      await conn.execute(`INSERT INTO provider_profiles (location_mode, fixed_latitude, fixed_longitude, category_id, service_ids, user_id) VALUES (?, ?, ?, ?, ?, ?)`, [...values, user.id]);
    }
    if (profile.coverage) await saveCoverage((sql, params) => conn.execute(sql, params), user.id, profile.coverage);
  });
  return success(res, await User.findById(user.id), req.t('account_type_changed'));
});

module.exports = {
  changeRole,
  list, getOne, updateMe, updateProvider, getProviderReviews,
  block, unblock, remove, createByAdmin, updateByAdmin,
};
