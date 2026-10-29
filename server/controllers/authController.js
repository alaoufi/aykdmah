const User = require('../models/User');
const Setting = require('../models/Setting');
const { hashPassword, comparePassword } = require('../utils/hash');
const { sign } = require('../utils/jwt');
const { success, created, error, unauthorized } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { validateUserLocation, requireCompleteAccountProfile } = require('../utils/userLocation');
const { validateProviderServices } = require('../utils/providerServices');
const { validateCoverage } = require('../utils/providerCoverage');
const phoneCodes = require('../services/phoneCodeService');

const CODE_ERRORS = { no_active_code: 'phone_code_expired', max_attempts: 'phone_code_expired', invalid_code: 'phone_code_invalid' };
const env = require('../config/env');
const cookieOptions = () => ({ httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });

function issueSession(res, user) {
  const token = sign({ id: user.id, role: user.role, auth_version: Number(user.auth_version || 0) });
  const expires = require('../utils/jwt').decode(token)?.exp;
  res.cookie('token', token, { ...cookieOptions(), ...(expires ? { expires: new Date(expires * 1000) } : {}) });
  return token;
}

function clearSession(req, res) {
  res.clearCookie('token', cookieOptions());
  const io = req.app.get('io');
  if (io) io.in(`user:${req.user.id}`).disconnectSockets(true);
}

// At least ONE of these must be present at registration time.
// Mapping: setting key (CSV from auth_methods_enabled) → user column.
const IDENTIFIER_FIELDS = {
  username: 'username',
  email: 'email',
  phone: 'phone',
  facebook: 'facebook_id',
};
const ALL_IDENTIFIERS = Object.values(IDENTIFIER_FIELDS);
const IDENTIFIER_CHECKS = [
  { field: 'email', message: 'email_taken', lookup: User.findByEmail },
  { field: 'phone', message: 'phone_taken', lookup: User.findByPhone },
  { field: 'username', message: 'username_taken', lookup: User.findByUsername },
  { field: 'facebook_id', message: 'facebook_taken', lookup: User.findByFacebookId },
];

function identifierConflict(req, res, fields) {
  const errors = fields.map(field => ({ field, message: req.t(IDENTIFIER_CHECKS.find(check => check.field === field).message) }));
  return error(res, errors[0].message, 409, errors);
}

async function enabledIdentifiers() {
  const csv = await Setting.get('auth_methods_enabled', 'username,email,phone,facebook');
  const keys = String(csv).split(',').map((s) => s.trim()).filter(Boolean);
  return keys.map((k) => IDENTIFIER_FIELDS[k]).filter(Boolean);
}

const register = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const completeOnboarding = req.body.onboarding_version !== undefined;
  if (completeOnboarding && ![1, '1', 2, '2'].includes(req.body.onboarding_version)) return error(res, req.t('invalid_data'), 400);
  // Version 2 (AYK-027): phone, password, optional name and an automatic
  // location. "both" is a provider account that also requests services.
  const simple = [2, '2'].includes(req.body.onboarding_version);
  if (!['client', 'provider'].includes(req.body.role) && !(simple && req.body.role === 'both')) {
    return error(res, req.t('type_invalid'), 400);
  }
  const alsoClient = req.body.role === 'both';
  const role = alsoClient ? 'provider' : req.body.role;
  let full_name = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : req.body.full_name;
  if (!simple && (typeof full_name !== 'string' || full_name.length < 2 || full_name.length > 150)) return error(res, req.t('invalid_data'), 400);
  if (simple && full_name !== undefined && full_name !== null && full_name !== '' &&
      (typeof full_name !== 'string' || full_name.length < 2 || full_name.length > 150)) return error(res, req.t('invalid_data'), 400);

  // Service venue belongs to the provider profile. Legacy signups that omit
  // it keep working, while a client's payload cannot set provider fields.
  const providerLocation = {};
  const hasProviderServices = role === 'provider' &&
    (completeOnboarding || req.body.category_id !== undefined || req.body.service_ids !== undefined);
  if (role === 'provider') {
    const mode = req.body.location_mode === undefined ? 'mobile' : req.body.location_mode;
    if (!['fixed', 'mobile', 'both'].includes(mode)) return error(res, req.t('invalid_data'), 400);
    const address = req.body.fixed_address;
    if (address !== undefined && address !== null && (typeof address !== 'string' || address.length > 255)) {
      return error(res, req.t('invalid_data'), 400);
    }
    providerLocation.location_mode = mode;
    providerLocation.fixed_address = mode === 'mobile' ? null : (address?.trim() || null);
    if (mode !== 'mobile' && (req.body.fixed_latitude != null || req.body.fixed_longitude != null)) {
      const coord = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
      const lat = coord(req.body.fixed_latitude), lon = coord(req.body.fixed_longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)
          || lat < -90 || lat > 90 || lon < -180 || lon > 180) return error(res, req.t('invalid_data'), 400);
      providerLocation.fixed_latitude = lat;
      providerLocation.fixed_longitude = lon;
    }
    Object.assign(providerLocation, await validateProviderServices(simple ? { service_ids: req.body.service_ids, any_category: true } : req.body, {}, {
      required: hasProviderServices, message: req.t('provider_services_required'),
    }));
    if (simple) providerLocation.any_category = true;
  }

  // Filter out identifiers the admin has turned off — silently ignore
  // them rather than failing, so a stale form can't break registration.
  const enabled = await enabledIdentifiers();
  if (completeOnboarding && !enabled.includes('phone')) return error(res, req.t('account_phone_unavailable'), 400);
  const filtered = {};
  for (const field of ALL_IDENTIFIERS) {
    if (enabled.includes(field) && req.body[field] && String(req.body[field]).trim()) {
      filtered[field] = String(req.body[field]).trim();
      if (field === 'phone') filtered[field] = filtered[field].replace(/[\s()-]/g, '');
    }
  }
  // New service-selection onboarding uses a phone as its sole login identity.
  // Preserve the older API contract for existing app versions and accounts.
  if (hasProviderServices && (!filtered.phone || !/^\+?\d{8,15}$/.test(filtered.phone))) {
    return error(res, req.t('provider_phone_required'), 400);
  }
  if (hasProviderServices) {
    for (const field of ['username', 'email', 'facebook_id']) delete filtered[field];
  }
  if (Object.keys(filtered).length === 0) {
    return error(res, req.t('need_one_identifier'), 400);
  }

  // Per-identifier uniqueness across the entire users table.
  const duplicateFields = (await Promise.all(IDENTIFIER_CHECKS.map(async check =>
    filtered[check.field] && await check.lookup(filtered[check.field]) ? check.field : null,
  ))).filter(Boolean);
  if (duplicateFields.length) return identifierConflict(req, res, duplicateFields);

  const location = await validateUserLocation(req.body, {}, req.t('invalid_data'));
  if (simple) {
    // No typing needed: a blank name becomes an editable label, and a blank
    // address becomes the area names of the point the device reported.
    if (!full_name && filtered.phone) full_name = `مستخدم ${filtered.phone.slice(-4)}`;
    if (!location.address && location.city_id) {
      const db = require('../config/database');
      const city = await db.queryOne('SELECT name_ar FROM cities WHERE id = ?', [location.city_id]);
      const district = location.district_id ? await db.queryOne('SELECT name_ar FROM districts WHERE id = ?', [location.district_id]) : null;
      location.address = [district?.name_ar, city?.name_ar].filter(Boolean).join('، ') || null;
    }
  }
  if (completeOnboarding) {
    await requireCompleteAccountProfile({ ...req.body, full_name, ...location, phone: filtered.phone, ...(simple ? { location_confirmed: true } : {}) },
      req.t('account_profile_required'), { confirmed: true });
  }
  if (simple && role === 'provider') {
    providerLocation.coverage = await validateCoverage(req.body, { cityId: location.city_id, required: true, message: req.t('provider_area_required') });
  }
  // Working days and hours chosen at sign-up (AYK-040); outside them the provider is hidden.
  const workHours = role === 'provider' ? require('../utils/providerAvailability').validateAvailability(
    Object.fromEntries(['work_days', 'work_from', 'work_to'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]])),
    req.t('invalid_data')) : {};
  if (hasProviderServices && (!location.city_id || (!location.district_id &&
      await require('../config/database').queryOne('SELECT id FROM districts WHERE city_id = ? AND is_active = 1 LIMIT 1', [location.city_id])))) {
    return error(res, req.t('provider_area_required'), 400);
  }
  // A coupon is checked before the account exists, so a typo never creates a half-linked account.
  const wallet = require('../services/walletService');
  const couponCode = String(req.body.referral_code || '').trim();
  if (couponCode && !await wallet.findReferrerByCode(couponCode)) return error(res, 'coupon_not_found', 400);
  // With an active SMS provider, a simple sign-up proves the phone first (AYK-016).
  const phoneVerified = simple && await phoneCodes.smsAvailable();
  if (phoneVerified) {
    if (!req.body.phone_code) return error(res, req.t('phone_code_required'), 400, [{ field: 'phone_code', message: req.t('phone_code_required') }]);
    const check = await phoneCodes.verifyCode({ phone: filtered.phone, purpose: 'signup', code: req.body.phone_code });
    if (!check.ok) return error(res, req.t(CODE_ERRORS[check.reason] || 'phone_code_invalid'), 400, [{ field: 'phone_code', message: req.t(CODE_ERRORS[check.reason] || 'phone_code_invalid') }]);
  }
  const passwordHash = password ? await hashPassword(password) : await hashPassword(require('crypto').randomBytes(16).toString('hex'));
  let userId;
  try {
    userId = await User.create({
      full_name,
      username:    filtered.username    || null,
      email:       filtered.email       || null,
      phone:       filtered.phone       || null,
      facebook_id: filtered.facebook_id || null,
      password_hash: passwordHash, role, also_client: alsoClient,
      ...location,
      ...providerLocation,
    });
  } catch (err) {
    // Concurrent registration can reach the database uniqueness constraint
    // after the checks above; report the same field error in that case.
    const constraint = String(err.constraint || '');
    const conflict = err.code === '23505' && IDENTIFIER_CHECKS.find(check => constraint.includes(check.field === 'facebook_id' ? 'facebook' : check.field));
    if (conflict) return identifierConflict(req, res, [conflict.field]);
    throw err;
  }

  if (Object.keys(workHours).length) await User.updateProviderProfile(userId, workHours);
  if (phoneVerified) await markPhoneVerified(userId, filtered.phone);
  if (couponCode) await wallet.applyReferralCode(userId, couponCode).catch(() => {});
  const referralCode = await wallet.ensureReferralCode(userId).catch(() => null);

  // Record terms acceptance — best-effort, skipped if migration 025 hasn't
  // run yet so registration never breaks on a half-migrated host.
  if (req.body.terms_accepted) {
    try {
      const version = String(req.body.terms_version || '1.0').slice(0, 20);
      await require('../config/database').query(
        `UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP, terms_accepted_version = ? WHERE id = ?`,
        [version, userId]
      );
    } catch (_) { /* column may not exist on older schemas */ }
  }

  const user = await User.findById(userId);
  const raw = await User.findByIdRaw(user.id);
  const token = issueSession(res, raw);
  return created(res, { user, token, ...(referralCode ? { referral_code: referralCode } : {}) }, req.t('account_created'));
});

async function markPhoneVerified(userId, phone) {
  const db = require('../config/database');
  await db.query('UPDATE users SET is_verified = 1, phone_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  await db.query(`INSERT INTO user_verifications (user_id, method, status, identifier, verified_at, metadata)
    VALUES (?, 'sms', 'verified', ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT (user_id, method) DO UPDATE SET status = 'verified', identifier = EXCLUDED.identifier,
    verified_at = CURRENT_TIMESTAMP, expires_at = NULL, metadata = EXCLUDED.metadata`,
  [userId, phone, JSON.stringify({ confirmed_via: 'phone_code' })]);
}

// POST /auth/phone-code { phone, purpose: signup | reset }
const sendPhoneCode = asyncHandler(async (req, res) => {
  const { purpose } = req.body;
  const phone = phoneCodes.normalizePhone(req.body.phone);
  if (!phoneCodes.PURPOSES.includes(purpose) || !/^\+?\d{8,15}$/.test(phone)) return error(res, req.t('invalid_data'), 400);
  if (!await phoneCodes.smsAvailable()) {
    return purpose === 'signup' ? success(res, { required: false }) : error(res, req.t('sms_unavailable'), 503);
  }
  if (!phoneCodes.saudiMobile(phone)) return error(res, req.t('phone_invalid'), 400);
  const existing = await User.findByPhone(phone);
  if (purpose === 'signup' && existing) return identifierConflict(req, res, ['phone']);
  // A reset for an unknown number answers like a sent code, so numbers cannot be probed.
  if (purpose === 'reset' && !existing) return success(res, { required: true, sent: true }, req.t('code_sent'));
  try {
    const result = await phoneCodes.sendCode({ phone, purpose, ip: req.ip });
    return success(res, result, req.t('code_sent'));
  } catch (err) {
    const key = { throttled: 'phone_code_throttled', daily_limit: 'phone_code_daily_limit', sms_failed: 'sms_failed' }[err.message];
    if (key) return error(res, req.t(key), err.status || 400);
    throw err;
  }
});

// POST /auth/phone-check { phone } — checked as soon as the sign-up phone field
// loses focus. It reveals no more than sign-up itself, which answers 409 for a used number.
const checkPhone = asyncHandler(async (req, res) => {
  const phone = phoneCodes.normalizePhone(req.body.phone);
  if (!phoneCodes.saudiMobile(phone)) return success(res, { valid: false });
  const local = '0' + phone.slice(-9);
  const existing = await User.findByPhone(phone) || (local !== phone ? await User.findByPhone(local) : null);
  return success(res, { valid: true, available: !existing });
});

// POST /auth/reset-password { phone, code, password }
const resetPassword = asyncHandler(async (req, res) => {
  const phone = phoneCodes.normalizePhone(req.body.phone);
  const { code, password } = req.body;
  if (!/^\+?\d{8,15}$/.test(phone) || typeof password !== 'string' || password.length < 4 || password.length > 100) return error(res, req.t('invalid_data'), 400);
  const check = await phoneCodes.verifyCode({ phone, purpose: 'reset', code });
  if (!check.ok) return error(res, req.t(CODE_ERRORS[check.reason] || 'phone_code_invalid'), 400);
  const user = await User.findByPhone(phone);
  if (!user) return error(res, req.t('phone_code_invalid'), 400);
  // A new auth_version signs out every existing session.
  await User.updatePassword(user.id, await hashPassword(password));
  await markPhoneVerified(user.id, user.phone);
  return success(res, null, req.t('password_reset_done'));
});

const login = asyncHandler(async (req, res) => {
  // Accept either modern 'identifier' or legacy 'email' for back-compat
  const { identifier, email, password } = req.body;
  const id = identifier || email;
  if (!id) return error(res, req.t('invalid_credentials'), 400);

  let user = await User.findByIdentifier(id);
  if (!user) return unauthorized(res, req.t('invalid_credentials'));
  const valid = await comparePassword(password || '', user.password_hash || '');
  if (!valid) return unauthorized(res, req.t('invalid_credentials'));
  user = await User.completeLogin(user.id, user.password_hash);
  if (!user) return unauthorized(res, req.t('invalid_credentials'));
  if (user.is_blocked) return error(res, req.t('account_blocked'), 403);
  if (!user.is_active) return error(res, req.t('account_inactive'), 403);

  const token = issueSession(res, user);
  const safe = await User.findById(user.id);
  return success(res, { user: safe, token }, req.t('logged_in'));
});

const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await User.setOnline(req.user.id, false);
    await User.revokeSessions(req.user.id);
    clearSession(req, res);
  }
  return success(res, null, req.t('logged_out'));
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  // Accounts created before every account had a customer number get one here.
  if (user && !user.referral_code) {
    user.referral_code = await require('../services/walletService').ensureReferralCode(user.id).catch(() => null);
  }
  // Refresh a media cookie for clients restoring a bearer session from local
  // storage; the original token's expiry remains the cookie's expiry.
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (bearer) {
    const expires = require('../utils/jwt').decode(bearer[1])?.exp;
    res.cookie('token', bearer[1], { ...cookieOptions(), ...(expires ? { expires: new Date(expires * 1000) } : {}) });
  }
  let provider = null;
  if (user.role === 'provider') {
    provider = await User.getProviderProfile(user.id);
  }
  return success(res, { user, provider });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await User.findByIdRaw(req.user.id);
  const valid = await comparePassword(current_password, user?.password_hash || '');
  if (!valid) return unauthorized(res, req.t('current_password_wrong'));

  const hash = await hashPassword(new_password);
  if (!await User.updatePassword(req.user.id, hash, user.password_hash)) return error(res, req.t('current_password_wrong'), 409);
  clearSession(req, res);
  return success(res, null, req.t('password_changed'));
});

module.exports = { register, login, logout, me, changePassword, sendPhoneCode, checkPhone, resetPassword };
