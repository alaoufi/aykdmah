const { verify } = require('../utils/jwt');
const { query, queryOne, tableHasColumn } = require('../config/database');
const { unauthorized, forbidden } = require('../utils/apiResponse');
const env = require('../config/env');
const { ApiError } = require('./errorHandler');

// The admin area's requests say so (X-Ayk-Scope: admin); its pictures and files are asked for
// from an /admin page. They use the admin cookie; everything else uses the site's (AYK-151).
function sessionCookieName(req) {
  if (req.get?.('x-ayk-scope') === 'admin') return 'admin_token';
  try {
    const referer = req.get?.('referer');
    if (referer && /^\/admin(\/|$)/.test(new URL(referer).pathname)) return 'admin_token';
  } catch (_) { /* no usable referrer: the site's session */ }
  return 'token';
}

// Which area a request comes from: "admin" (the /admin pages) or "site" (the site and the app).
function requestScope(req) {
  return sessionCookieName(req) === 'admin_token' ? 'admin' : 'site';
}

function tokenFromRequest(req) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(header);
  const mediaCookie = ['GET', 'HEAD'].includes(req.method) && /^\/api\/media\/[^/?]+(?:\?|$)/.test(req.originalUrl || '');
  const cookie = mediaCookie ? req.cookies?.[sessionCookieName(req)] : undefined;
  return { token: bearer ? bearer[1] : cookie, cookie: !bearer && !!cookie };
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

// The session's area (AYK-151): from the token; a token from before areas existed belongs to
// the area it is used in.
function sessionScope(payload, fallback = 'site') {
  if (payload?.scope === 'admin' || payload?.scope === 'site') return payload.scope;
  return fallback === 'admin' ? 'admin' : 'site';
}

// The site and the app never act as the administration (AYK-151): there, an admin account is an
// ordinary user, with no admin permissions. The admin tools exist only in an admin session.
function asSiteUser(user) {
  if (!user || user.role !== 'admin') return user;
  return { ...user, role: 'client', is_super_admin: 0, permissions: [], admin_account: 1 };
}

async function loadSessionUser(payload, fallbackScope = 'site') {
  // A deployment without the permission schema must fail closed for admins.
  const [hasAdminCols, hasVersion, hasAlsoClient, hasScopes, hasUiLang] = await Promise.all([
    tableHasColumn('users', 'is_super_admin'), tableHasColumn('users', 'auth_version'), tableHasColumn('users', 'also_client'),
    tableHasColumn('users', 'admin_session_version'), tableHasColumn('users', 'ui_lang'),
  ]);
  if (!hasVersion) throw new ApiError('Authentication schema is unavailable', 503);
  const scope = sessionScope(payload, fallbackScope);
  const extra = (hasAdminCols ? ', is_super_admin, permissions' : '') + (hasVersion ? ', auth_version' : '') + (hasAlsoClient ? ', also_client' : '')
    + (hasScopes ? ', site_session_version, admin_session_version' : '') + (hasUiLang ? ', ui_lang' : '');
  const user = await queryOne(
    `SELECT id, full_name, email, phone, role, is_active, is_blocked, avatar${extra}
     FROM users WHERE id = ? AND deleted_at IS NULL`, [payload.id]
  );
  if (!user) return null;
  if (Number(user.auth_version || 0) !== (payload.auth_version ?? 0)) return null;
  // Signing out of one area ends only that area's sessions.
  if (hasScopes && Number(user[`${scope}_session_version`] || 0) !== (payload.sv ?? 0)) return null;
  delete user.auth_version;
  delete user.site_session_version;
  delete user.admin_session_version;
  user.is_super_admin = hasAdminCols && (user.is_super_admin === 1 || user.is_super_admin === true) ? 1 : 0;
  if (typeof user.permissions === 'string') {
    try { user.permissions = JSON.parse(user.permissions); } catch (_) { user.permissions = []; }
  }
  if (!Array.isArray(user.permissions)) user.permissions = [];
  // Only a session made for the site (since AYK-151) hides the admin role; older tokens keep theirs.
  const shown = payload?.scope === 'site' ? asSiteUser(user) : user;
  shown.session_scope = scope;
  return shown;
}

// The language the user uses the site in (AYK-231), kept so their chat messages are translated
// into it as soon as they are sent. Written only when it changes, without delaying the request.
const LANGS = new Set(['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr']);
function rememberLanguage(user, lang) {
  if (!user || !('ui_lang' in user) || !LANGS.has(lang) || user.ui_lang === lang) return;
  query('UPDATE users SET ui_lang = ? WHERE id = ?', [lang, user.id]).catch(() => {});
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

    const user = await loadSessionUser(payload, requestScope(req));
    if (!user) return unauthorized(res, req.t('account_not_found'));
    if (user.is_blocked) return forbidden(res, req.t('account_blocked'));
    if (!user.is_active) return forbidden(res, req.t('account_inactive'));

    req.user = user;
    rememberLanguage(user, req.lang);
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
    const user = await loadSessionUser(payload, requestScope(req));
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

module.exports = { authenticate, optionalAuth, loadSessionUser, sessionCookieName, requestScope, asSiteUser };
