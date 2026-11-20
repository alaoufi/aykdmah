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
  { key: 'texts.manage',         group: 'system',       label: 'admin.perm.texts' },
  { key: 'activity_logs.view',   group: 'system',       label: 'admin.perm.activity_logs' },
  { key: 'test_data.manage',     group: 'system',       label: 'admin.perm.test_data',       sensitive: true },
];

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const KEY_SET = new Set(PERMISSION_KEYS);

function isValidPermission(key) {
  return KEY_SET.has(key);
}

// AYK-359 (the owner: «لو أضفت أقسامًا جديدة لازم أضيف القسم»). Besides single tabs (the keys
// above), an account may be granted:
//   '*'            every section, including sections added later;
//   'group:<name>' one whole section, including tabs added to it later.
// Neither includes managing other administration accounts (admins.manage): that is granted only
// as its own tab, or by «إدارة عامة» (is_super_admin).
const ALL = '*';
const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];
const GROUP_OF = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.group]));
const NOT_IN_WIDE_GRANTS = new Set(['admins.manage']);
const isGrant = (k) => typeof k === 'string' && (KEY_SET.has(k) || k === ALL || (k.startsWith('group:') && GROUPS.includes(k.slice(6))));

function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isGrant))];
}

// The tabs an account opens today: its single tabs plus every tab its wide grants cover.
function expandPermissions(list) {
  const grants = sanitizePermissions(list);
  const out = new Set(grants.filter((k) => KEY_SET.has(k)));
  for (const p of PERMISSIONS) {
    if (NOT_IN_WIDE_GRANTS.has(p.key)) continue;
    if (grants.includes(ALL) || grants.includes(`group:${p.group}`)) out.add(p.key);
  }
  return [...out];
}

// Whether `grants` (an account's saved list) includes `grant` (one entry of another list): a
// member may hand on only what is theirs, a wide grant only when they hold it as wide.
function grantCovers(grants, grant) {
  const mine = sanitizePermissions(grants);
  if (mine.includes(grant)) return true;
  if (grant === ALL) return false;
  if (grant.startsWith('group:')) return mine.includes(ALL);
  return expandPermissions(mine).includes(grant);
}

module.exports = { PERMISSIONS, PERMISSION_KEYS, GROUPS, ALL, GROUP_OF, isValidPermission, sanitizePermissions, expandPermissions, grantCovers };
