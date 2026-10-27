// Permission registry — single source of truth for the
// specialized-admin role. The super admin (is_super_admin = 1)
// bypasses every check; specialized admins only see / use what's
// explicitly granted.
//
// Adding a new admin section in the future is a 3-step process:
//   1. Add the key here with its group/label.
//   2. Wrap the route(s) with requirePermission(<key>).
//   3. Add a translation for the label in client locales.

const PERMISSIONS = [
  // overview
  { key: 'dashboard.view',       group: 'overview',     label: 'admin.perm.dashboard' },

  // users
  { key: 'users.manage',         group: 'users',        label: 'admin.perm.users' },
  { key: 'verifications.review', group: 'users',        label: 'admin.perm.verifications' },
  { key: 'admins.manage',        group: 'users',        label: 'admin.perm.admins',          sensitive: true },

  // requests & comms
  { key: 'requests.manage',      group: 'requests',     label: 'admin.perm.requests' },
  { key: 'reviews.manage',       group: 'requests',     label: 'admin.perm.reviews' },
  { key: 'disputes.manage',      group: 'requests',     label: 'admin.perm.disputes' },
  { key: 'conversations.read',   group: 'requests',     label: 'admin.perm.conversations',   sensitive: true },

  // catalog
  { key: 'categories.manage',    group: 'catalog',      label: 'admin.perm.categories' },
  { key: 'services.manage',      group: 'catalog',      label: 'admin.perm.services' },

  // geo
  { key: 'countries.manage',     group: 'geo',          label: 'admin.perm.countries' },
  { key: 'locations.manage',     group: 'geo',          label: 'admin.perm.locations' },

  // monetisation
  { key: 'ads.manage',           group: 'monetisation', label: 'admin.perm.ads' },
  { key: 'plans.manage',         group: 'monetisation', label: 'admin.perm.plans' },
  { key: 'badges.manage',        group: 'monetisation', label: 'admin.perm.badges' },
  { key: 'wallets.manage',       group: 'monetisation', label: 'admin.perm.wallets',          sensitive: true },

  // system
  { key: 'integrations.manage',  group: 'system',       label: 'admin.perm.integrations' },
  { key: 'settings.manage',      group: 'system',       label: 'admin.perm.settings',        sensitive: true },
  { key: 'activity_logs.view',   group: 'system',       label: 'admin.perm.activity_logs' },
  { key: 'test_data.manage',     group: 'system',       label: 'admin.perm.test_data',       sensitive: true },
];

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const KEY_SET = new Set(PERMISSION_KEYS);

function isValidPermission(key) {
  return KEY_SET.has(key);
}

function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((k) => typeof k === 'string' && KEY_SET.has(k)))];
}

module.exports = { PERMISSIONS, PERMISSION_KEYS, isValidPermission, sanitizePermissions };
