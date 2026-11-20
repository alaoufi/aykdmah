// Each item declares the permission its admin section needs. The sidebar
// hides items the current admin can't reach (super admin sees them all).
export const NAV_GROUPS = [
  {
    label: 'admin.overview',
    items: [
      // AYK-346 (the owner): the control home opens for every member of the administration; it shows
      // the figures only with «dashboard.view», otherwise the sections this member may open.
      { to: '/admin', icon: '📊', labelKey: 'admin.dashboard', end: true, perm: null },
      { to: '/admin/marketing', icon: '📈', labelKey: 'marketing.title', perm: 'dashboard.view' },
      { to: '/admin/guide', icon: '📖', labelKey: 'help.admin_book_title', perm: null },
    ],
  },
  {
    // AYK-271 (the owner's request): one "Reports" section near the top for every report, today
    // security, backups and the activity log; a future report is one more line here.
    label: 'admin.reports_group',
    items: [
      { to: '/admin/security', icon: '🛡️', labelKey: 'admin.security_report', perm: 'activity_logs.view' },
      { to: '/admin/reports/backups', icon: '🗄️', labelKey: 'admin.backups_report', perm: 'activity_logs.view' },
      { to: '/admin/activity-logs', icon: '📜', labelKey: 'admin.activity_logs',  perm: 'activity_logs.view' },
    ],
  },
  {
    label: 'admin.users',
    items: [
      { to: '/admin/users',         icon: '👥', labelKey: 'admin.users',           perm: 'users.manage' },
      { to: '/admin/providers',     icon: '🧰', labelKey: 'admin.stats_providers', perm: 'users.manage' },
      { to: '/admin/countries',     icon: '🌍', labelKey: 'admin.countries',       perm: 'countries.manage' },
      { to: '/admin/locations',     icon: '🗺️', labelKey: 'admin.locations',       perm: 'locations.manage' },
      { to: '/admin/verifications', icon: '🛡️', labelKey: 'admin.verifications',   perm: 'verifications.review' },
    ],
  },
  {
    label: 'admin.requests',
    items: [
      { to: '/admin/requests',      icon: '📋', labelKey: 'admin.requests',              perm: 'requests.manage' },
      { to: '/admin/support', icon: '📨', labelKey: 'support.admin_title', perm: 'users.manage' },
      { to: '/admin/conversations', icon: '💬', labelKey: 'admin.conversations_monitor', perm: 'conversations.read' },
      { to: '/admin/calls', icon: '📞', labelKey: 'calls.admin.title', perm: 'conversations.read' },
      { to: '/admin/wallets', icon: '💰', labelKey: 'wallet.admin.title', perm: 'wallets.manage' },
      { to: '/admin/reviews',       icon: '⭐', labelKey: 'admin.reviews',               perm: 'reviews.manage' },
      { to: '/admin/disputes',      icon: '⚖️', labelKey: 'dispute.admin_title',         perm: 'disputes.manage' },
    ],
  },
  {
    label: 'admin.services',
    items: [
      { to: '/admin/categories', icon: '🗂️', labelKey: 'admin.categories', perm: 'categories.manage' },
      { to: '/admin/services',   icon: '🛠️', labelKey: 'admin.services',   perm: 'services.manage' },
      { to: '/admin/plans',      icon: '💎', labelKey: 'admin.plans',      perm: 'plans.manage' },
      { to: '/admin/badges',     icon: '🛡️', labelKey: 'admin.badges',     perm: 'badges.manage' },
    ],
  },
  {
    label: 'admin.ads',
    items: [
      { to: '/admin/ads',           icon: '📣', labelKey: 'admin.ads',            perm: 'ads.manage' },
    ],
  },
  {
    label: 'admin.settings',
    items: [
      { to: '/admin/integrations', icon: '🔌', labelKey: 'admin.integrations', perm: 'integrations.manage' },
      { to: '/admin/settings',     icon: '⚙️', labelKey: 'admin.settings',     perm: 'settings.manage' },
      { to: '/admin/texts',        icon: '🔤', labelKey: 'admin.texts.title',  perm: 'texts.manage' },
      { to: '/admin/form-fields',  icon: '🧩', labelKey: 'admin.form_fields.title', perm: 'settings.manage' },
    ],
  },
];

// The sections one member may open (super administrators: all), in menu order.
export function allowedSections(hasPermission) {
  return NAV_GROUPS.flatMap(g => g.items).filter(it => it.perm && hasPermission(it.perm));
}
