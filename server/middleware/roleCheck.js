const { forbidden } = require('../utils/apiResponse');
const { isValidPermission, sanitizePermissions } = require('../config/permissions');

function hasPermission(user, key) {
  if (!user || user.role !== 'admin' || !isValidPermission(key)) return false;
  if (user.is_super_admin === 1 || user.is_super_admin === true) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(key);
}

function canManageAdmin(actor, target) {
  if (!hasPermission(actor, 'admins.manage')) return false;
  if (actor.is_super_admin === 1 || actor.is_super_admin === true) return true;
  if (target.is_super_admin) return false;
  let permissions = target.permissions;
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch (_) { return false; }
  }
  return sanitizePermissions(permissions).every(key => hasPermission(actor, key));
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return forbidden(res, req.t('must_login'));
    if (!roles.includes(req.user.role)) return forbidden(res, req.t('forbidden'));
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireProvider = requireRole('provider');
const requireClient = requireRole('client');
const requireProviderOrAdmin = requireRole('provider', 'admin');
const requireClientOrAdmin = requireRole('client', 'admin');

// Gate a route by an admin permission key (see
// server/config/permissions.js). Super admins (is_super_admin=1) skip
// the check. Must be chained AFTER authenticate + requireAdmin.
function requirePermission(key) {
  return (req, res, next) => {
    if (hasPermission(req.user, key)) return next();
    return forbidden(res, req.t('forbidden'));
  };
}

module.exports = {
  requireRole, requireAdmin, requireProvider, requireClient,
  requireProviderOrAdmin, requireClientOrAdmin, requirePermission, hasPermission, canManageAdmin,
};
