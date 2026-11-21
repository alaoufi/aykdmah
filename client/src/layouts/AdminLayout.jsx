import { useState } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/common/Avatar';
import BrandLogo from '../components/common/BrandLogo';
import useArabicOnly from '../hooks/useArabicOnly';
import UpdateBar from '../components/common/UpdateBar';
import { IconMenu, IconClose, IconBell } from '../components/common/Icons';
import { useNotifications } from '../hooks/useNotifications';
import { AdminBackProvider, AdminBackButton } from '../components/admin/AdminBackNavigation';

import { NAV_GROUPS } from './adminNav';
import { applyMenuLayout, useMenuLayout } from './menuLayout';

// The menu item a page belongs to (its longest matching address), or null for pages outside the menu.
export function findCurrentItem(pathname) {
  let best = null;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if ((it.end ? pathname === it.to : pathname === it.to || pathname.startsWith(`${it.to}/`)) && (!best || it.to.length > best.to.length)) best = it;
    }
  }
  return best;
}

function findCurrentLabel(pathname) {
  return findCurrentItem(pathname)?.labelKey || 'admin.dashboard';
}

function AdminLayoutFrame() {
  useArabicOnly();
  const { t } = useTranslation();
  const { user, logout, hasPermission, isSuperAdmin } = useAuth();
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const currentLabel = findCurrentLabel(location.pathname);

  // Filter nav: super admin sees everything; specialized admins only see
  // groups that have at least one item they can access.
  // AYK-410: the order the administration set in «ترتيب القوائم».
  const menuLayout = useMenuLayout();
  const visibleGroups = applyMenuLayout(NAV_GROUPS, menuLayout)
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || hasPermission(it.perm)) }))
    .filter((g) => g.items.length > 0);
  // Each admin sees only the sections granted to them (AYK-211), also when a section is opened by its
  // address: the server refuses the data anyway, and the page itself is not shown either.
  const current = findCurrentItem(location.pathname);
  const allowed = !current?.perm || hasPermission(current.perm);
  const firstItem = visibleGroups.flatMap((g) => g.items).find((it) => it.perm) || { to: '/admin/guide', labelKey: 'help.admin_book_title' };
  const firstAllowed = firstItem.to;
  const firstAllowedLabel = firstItem.labelKey;

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    // The menu sits at the start of the reading direction: on the right in Arabic (AYK-204).
    <div className="min-h-screen bg-bg text-fg flex">
      {/* The admin area updates itself like the site (AYK-279). */}
      <UpdateBar />
      <aside
        className={`fixed lg:static inset-y-0 start-0 z-40 w-72 bg-ink text-white/75 flex flex-col transition-transform ${
          open ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full lg:!translate-x-0'
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

        {user?.referral_code && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-card bg-white/10 text-white text-[14px]" data-testid="admin-your-number">
            {t('brand.your_number')}: <b dir="ltr" className="tracking-wider text-[16px]">{user.referral_code}</b>
          </div>
        )}
        {/* AYK-346 (the owner): «العودة للموقع» at the top of the menu. */}
        <Link to="/" onClick={() => setOpen(false)} data-testid="admin-back-to-site"
          className="mx-3 mt-3 flex items-center gap-3 px-3 py-2.5 rounded-card bg-white/10 hover:bg-white/15 text-white text-[14px] font-bold no-underline transition">
          <span className="text-[16px] w-5 text-center">🏠</span>العودة للموقع
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {visibleGroups.map((g) => (
            <div key={g.key || g.label}>
              <div className="px-3 mb-1 text-[10px] font-bold text-white/55 uppercase tracking-wider">
                {g.title || t(g.label)}
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
          <div className="grid grid-cols-1 gap-2">
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
          {/* Same as the site header (owner): ☰ on the page's right edge, logo on the left. */}
          <Link to="/admin" className="lg:hidden shrink-0 no-underline order-last" aria-label={t('admin.panel')}>
            <BrandLogo wordSize={16} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] text-fg-subtle font-bold uppercase tracking-wider">
              {t('admin.panel')}
            </div>
            <div className="text-[15px] font-extrabold text-fg truncate">{t(currentLabel)}</div>
          </div>
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
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt order-first"
            aria-label={t('common.more')}
          >
            <IconMenu />
          </button>
        </header>

        <main className="admin-workspace flex-1 p-3 md:p-4 lg:p-5 overflow-x-hidden">
          <div className="mb-3"><AdminBackButton /></div>
          {allowed ? <Outlet /> : (
            // A section opened by its address without the permission (AYK-211): nothing of it is shown.
            <div className="bg-surface rounded-card border border-border p-8 text-center" data-testid="admin-no-access">
              <div className="text-5xl mb-3">🔒</div>
              <p className="font-bold text-fg mb-4">{t('admin.no_access')}</p>
              <Link to={firstAllowed} className="btn btn-primary no-underline">{t(firstAllowedLabel)}</Link>
            </div>
          )}
          <style>{`
            .admin-workspace button, .admin-workspace select { min-height: 32px; }
            .admin-workspace .space-y-6 > :not([hidden]) ~ :not([hidden]) { margin-top: .75rem; }
            @media (max-width: 640px) {
              .admin-workspace button, .admin-workspace select { min-height: 44px; }
            }
          `}</style>
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return <AdminBackProvider><AdminLayoutFrame /></AdminBackProvider>;
}
