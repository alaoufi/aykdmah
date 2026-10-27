import { useState } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/common/Avatar';
import BrandLogo from '../components/common/BrandLogo';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { IconMenu, IconClose, IconBell } from '../components/common/Icons';
import { useNotifications } from '../hooks/useNotifications';
import BackButton from '../components/common/BackButton';

// Each item declares the permission its admin section needs. The sidebar
// hides items the current admin can't reach (super admin sees them all).
const NAV_GROUPS = [
  {
    label: 'admin.overview',
    items: [
      { to: '/admin', icon: '📊', labelKey: 'admin.dashboard', end: true, perm: 'dashboard.view' },
    ],
  },
  {
    label: 'admin.users',
    items: [
      { to: '/admin/users',         icon: '👥', labelKey: 'admin.users',           perm: 'users.manage' },
      { to: '/admin/countries',     icon: '🌍', labelKey: 'admin.countries',       perm: 'countries.manage' },
      { to: '/admin/locations',     icon: '🗺️', labelKey: 'admin.locations',       perm: 'locations.manage' },
      { to: '/admin/verifications', icon: '🛡️', labelKey: 'admin.verifications',   perm: 'verifications.review' },
    ],
  },
  {
    label: 'admin.requests',
    items: [
      { to: '/admin/requests',      icon: '📋', labelKey: 'admin.requests',              perm: 'requests.manage' },
      { to: '/admin/conversations', icon: '💬', labelKey: 'admin.conversations_monitor', perm: 'conversations.read' },
      { to: '/admin/calls', icon: '📞', labelKey: 'calls.admin.title', perm: 'conversations.read' },
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
      { to: '/admin/activity-logs', icon: '📜', labelKey: 'admin.activity_logs',  perm: 'activity_logs.view' },
    ],
  },
  {
    label: 'admin.settings',
    items: [
      { to: '/admin/integrations', icon: '🔌', labelKey: 'admin.integrations', perm: 'integrations.manage' },
      { to: '/admin/settings',     icon: '⚙️', labelKey: 'admin.settings',     perm: 'settings.manage' },
    ],
  },
];

function findCurrentLabel(pathname) {
  let best = { labelKey: 'admin.dashboard', score: -1 };
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.end ? pathname === it.to : pathname.startsWith(it.to)) {
        const score = it.to.length;
        if (score > best.score) best = { labelKey: it.labelKey, score };
      }
    }
  }
  return best.labelKey;
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout, hasPermission, isSuperAdmin } = useAuth();
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const currentLabel = findCurrentLabel(location.pathname);

  // Filter nav: super admin sees everything; specialized admins only see
  // groups that have at least one item they can access.
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || hasPermission(it.perm)) }))
    .filter((g) => g.items.length > 0);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-row-reverse">
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-72 bg-ink text-white/75 flex flex-col transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2.5 no-underline">
            <BrandLogo markSize={32} wordSize={18} tone="mono-light" />
            <span className="text-white/70 text-[11px] border-s border-white/15 ps-2.5">
              {t('admin.panel')}
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden w-9 h-9 rounded-pill bg-white/10 grid place-items-center text-white"
            aria-label={t('common.close')}
          >
            <IconClose size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {visibleGroups.map((g) => (
            <div key={g.label}>
              <div className="px-3 mb-1 text-[10px] font-bold text-white/55 uppercase tracking-wider">
                {t(g.label)}
              </div>
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-card text-[13.5px] font-semibold transition no-underline ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <span className="text-[16px] w-5 text-center">{it.icon}</span>
                    {t(it.labelKey)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <Avatar src={user?.avatar} name={user?.full_name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-white text-[13px] font-bold truncate">{user?.full_name}</div>
              <div className="text-white/70 text-[11px] truncate">
                {isSuperAdmin ? t('admin.role_super') : t('admin.role_specialized')}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/"
              className="px-3 py-2 rounded-pill bg-white/5 hover:bg-white/10 text-white text-[12px] font-semibold text-center no-underline transition"
            >
              {t('nav.home')}
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-pill bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[12px] font-semibold transition"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/50 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-surface border-b border-border/70 px-4 md:px-6 lg:px-8 h-16 flex items-center gap-3 sticky top-0 z-20">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt"
            aria-label={t('common.more')}
          >
            <IconMenu />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] text-fg-subtle font-bold uppercase tracking-wider">
              {t('admin.panel')}
            </div>
            <div className="text-[15px] font-extrabold text-fg truncate">{t(currentLabel)}</div>
          </div>
          <LanguageSwitcher />
          <Link
            to="/notifications"
            className="relative w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt no-underline"
            aria-label={t('notification.title')}
          >
            <IconBell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <div className="mb-3"><BackButton fallback="/admin" /></div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
