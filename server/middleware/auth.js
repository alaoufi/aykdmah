const { verify } = require('../utils/jwt');
const { queryOne, tableHasColumn } = require('../config/database');
const { unauthorized, forbidden } = require('../utils/apiResponse');
const env = require('../config/env');
const { ApiError } = require('./errorHandler');

function tokenFromRequest(req) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(header);
  const mediaCookie = ['GET', 'HEAD'].includes(req.method) && /^\/api\/media\/[^/?]+(?:\?|$)/.test(req.originalUrl || '');
  return { token: bearer ? bearer[1] : (mediaCookie ? req.cookies?.token : undefined), cookie: !bearer && mediaCookie && !!req.cookies?.token };
}

function cookieMutationAllowed(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin || typeof origin !== 'string') return false;
  const allowed = [env.CLIENT_URL, env.APP_URL, `${req.protocol}://${req.get('host')}`];
  return allowed.some(value => {
    try { return new URL(value).origin === origin; } catch (_) { return false; }
  });
}

async function loadSessionUser(payload) {
  // A deployment without the permission schema must fail closed for admins.
  const [hasAdminCols, hasVersion] = await Promise.all([
    tableHasColumn('users', 'is_super_admin'), tableHasColumn('users', 'auth_version'),
  ]);
  if (!hasVersion) throw new ApiError('Authentication schema is unavailable', 503);
  const extra = (hasAdminCols ? ', is_super_admin, permissions' : '') + (hasVersion ? ', auth_version' : '');
  const user = await queryOne(
    `SELECT id, full_name, email, phone, role, is_active, is_blocked, avatar${extra}
     FROM users WHERE id = ? AND deleted_at IS NULL`, [payload.id]
  );
  if (!user) return null;
  if (Number(user.auth_version || 0) !== (payload.auth_version ?? 0)) return null;
  delete user.auth_version;
  user.is_super_admin = hasAdminCols && (user.is_super_admin === 1 || user.is_super_admin === true) ? 1 : 0;
  if (typeof user.permissions === 'string') {
    try { user.permissions = JSON.parse(user.permissions); } catch (_) { user.permissions = []; }
  }
  if (!Array.isArray(user.permissions)) user.permissions = [];
  return user;
}

async function authenticate(req, res, next) {
  try {
    const { token, cookie } = tokenFromRequest(req);
    if (!token) return unauthorized(res, req.t('must_login'));
    if (cookie && !cookieMutationAllowed(req)) return forbidden(res, req.t('forbidden'));

    let payload;
    try {
      payload = verify(token);
    } catch (_) {
      return unauthorized(res, req.t('session_invalid'));
    }

    const user = await loadSessionUser(payload);
    if (!user) return unauthorized(res, req.t('account_not_found'));
    if (user.is_blocked) return forbidden(res, req.t('account_blocked'));
    if (!user.is_active) return forbidden(res, req.t('account_inactive'));

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  const { token } = tokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = verify(token);
    const user = await loadSessionUser(payload);
    if (user && user.is_active && !user.is_blocked) {
      req.user = user;
      req.userId = user.id;
      req.userRole = user.role;
    }
  } catch (_) {
    // ignore — treat as guest
  }
  next();
}

module.exports = { authenticate, optionalAuth, loadSessionUser };
