import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';
import { useNotifications } from '../../hooks/useNotifications';
import Avatar from '../common/Avatar';
import LanguageSwitcher from '../common/LanguageSwitcher';
import ThemeSwitcher from '../common/ThemeSwitcher';
import BrandLogo from '../common/BrandLogo';
import { IconMenu, IconBell, IconClose } from '../common/Icons';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { unread, chatUnread, supportCount } = useNotifications();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileButton = useRef(null);
  const mobilePanel = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobilePanel.current?.querySelector('button')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab') return;
      const items = Array.from(mobilePanel.current?.querySelectorAll('a[href], button, select, input') || [])
        .filter((item) => !item.disabled && item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 1280px)');
    const onResize = () => { if (desktop.matches) setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onResize);
      mobileButton.current?.focus();
    };
  }, [mobileOpen]);

  // Provider-only accounts see their work and their requests, not other professions (AYK-040).
  const LINKS = canRequestService(user) ? [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/services', label: t('nav.services') },
    { to: '/providers/map', label: t('map.nav_link') },
    { to: '/requests/new', label: t('nav.order_now'), requester: true },
  ] : [
    { to: '/provider', label: t('work.title'), end: true },
    { to: '/opportunities', label: t('work.requests_nav') },
  ];
  LINKS.push(
    { to: '/guide', label: t('help.title') },
    { to: '/chat', label: t('nav.chat'), authOnly: true },
  );

  const visibleLinks = LINKS.filter((l) => (!l.authOnly || user) && (!l.requester || canRequestService(user)));
  const dashLink = user?.role === 'admin' ? '/admin' : user?.role === 'provider' ? '/provider' : '/client';

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-md border-b border-border/70">
      <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 h-14 md:h-16 lg:h-[72px] flex items-center gap-2 md:gap-4">
        {/* Phones and tablets (owner): ☰ on the page's right edge, logo on the left edge. */}
        <Link to="/" className="site-logo xl:w-[166px] shrink-0 no-underline max-xl:order-5 max-xl:-me-1 max-xl:flex max-xl:justify-end">
          <BrandLogo wordSize={26} />
        </Link>

        {/* Spacer pushes the logo to the opposite edge */}
        <div className="flex-1 max-xl:order-4" />

        {/* Mobile controls cluster — sits on the END edge */}
        <ThemeSwitcher variant="compact" className="md:hidden max-xl:order-3" />
        <LanguageSwitcher variant="compact" className="md:hidden max-xl:order-3" />
        {/* The notifications bell on phones too: its count is not the chats count. */}
        {user && <Link to="/notifications" data-testid="mobile-bell"
          className="md:hidden max-xl:order-2 relative w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt no-underline" aria-label={t('notification.title')}>
          <IconBell size={18} />
          {unread > 0 && <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
        </Link>}
        <div className="xl:hidden shrink-0 max-xl:order-1">
        <button
          ref={mobileButton}
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="relative w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt"
          aria-label={t('common.more')}
          aria-expanded={mobileOpen}
          aria-controls="ayk-mobile-menu"
          aria-haspopup="dialog"
        >
          <IconMenu />
          {supportCount > 0 && <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-danger" aria-hidden="true" />}
        </button>
        </div>

        {/* Desktop nav */}
        <nav className="hidden xl:flex items-center gap-1 mx-4">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `relative px-4 py-2 rounded-pill text-[15px] font-semibold transition no-underline ${
                  isActive
                    ? 'text-primary bg-primary-soft'
                    : 'text-fg-muted hover:text-fg hover:bg-surface-alt'
                }`
              }
            >
              {l.label}
              {l.to === '/chat' && chatUnread > 0 && (
                <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <ThemeSwitcher variant="compact" className="hidden md:block" />
        <LanguageSwitcher className="hidden md:block" />

        {user ? (
          <div className="hidden md:flex items-center gap-2 relative">
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
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-pill hover:bg-surface-alt transition"
            >
              <Avatar src={user.avatar} name={user.full_name} size="sm" />
              <span className="text-sm font-semibold text-fg">{user.full_name?.split(' ')[0]}</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-full mt-2 inset-inline-end-0 bg-surface rounded-card shadow-card border border-border min-w-[220px] z-40 overflow-hidden">
                  <div className="p-3 border-b border-border">
                    <div className="text-sm font-bold text-fg">{user.full_name}</div>
                    <div className="text-xs text-fg-subtle">{user.email}</div>
                    {user.referral_code && <div className="text-xs text-fg-muted mt-0.5">{t('brand.your_number')}: <b dir="ltr">{user.referral_code}</b></div>}
                  </div>
                  <div className="p-1.5">
                    <Link to={dashLink} className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)}>
                      {t('nav.dashboard')}
                    </Link>
                    <Link to="/profile" className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)}>
                      {t('nav.profile')}
                    </Link>
                    {['client', 'provider'].includes(user.role) && (
                      <Link to="/profile#account-type" className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)} data-testid="menu-account-type">
                        🔁 {t('profile.change_account_type')}
                      </Link>
                    )}
                    <Link to="/disputes" className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)}>
                      ⚖️ {t('dispute.my_disputes')}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-right px-3 py-2 rounded text-sm font-semibold text-danger hover:bg-danger-soft"
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-2 rounded-pill text-[14px] font-semibold text-fg-muted hover:bg-surface-alt transition no-underline"
            >
              {t('nav.login')}
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-pill text-[14px] font-semibold text-primary-fg bg-primary-grad shadow-soft hover:shadow-lift transition active:scale-[.98] no-underline"
            >
              {t('nav.register')}
            </Link>
          </div>
        )}

      </div>

      {/* Mobile menu sheet */}
      {mobileOpen && createPortal(
        <div className="xl:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div ref={mobilePanel} id="ayk-mobile-menu" role="dialog" aria-modal="true" aria-label={t('common.more')}
            className="absolute top-3 inset-x-3 bg-surface rounded-[22px] shadow-card p-4 max-h-[calc(100dvh-24px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <BrandLogo markSize={30} wordSize={18} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 rounded-pill bg-surface-alt grid place-items-center text-fg-muted"
                aria-label={t('common.close')}
              >
                <IconClose size={18} />
              </button>
            </div>
            {/* "Your number" first (it is also a sign-in identifier), then the user's area. */}
            {user && (
              <div className="mb-3 px-3 py-2.5 rounded-card bg-primary-soft flex items-center justify-between gap-2 flex-wrap" data-testid="menu-your-number">
                {user.referral_code && (
                  <span className="text-[15px] text-fg">{t('brand.your_number')}: <b dir="ltr" className="tracking-wider text-[17px]">{user.referral_code}</b></span>
                )}
                {['client', 'provider'].includes(user.role) && (
                  <Link to="/profile#my-area" onClick={() => setMobileOpen(false)} className="text-[13px] font-semibold text-primary underline underline-offset-2" data-testid="edit-area">📍 {t('for_you.edit_area')}</Link>
                )}
              </div>
            )}
            <div className="flex flex-col">
              {visibleLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `text-right px-3 py-3 rounded-card font-semibold no-underline ${
                      isActive ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:bg-surface-alt'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
            {user && (
              <div className="flex flex-col mt-2 pt-2 border-t border-border">
                {/* "Manage" (AYK-075): my requests and my professional tasks, each active or archived. */}
                {(canRequestService(user) || user.role === 'provider') && (
                  <div className="mb-2 p-2 rounded-card bg-primary-soft" data-testid="menu-manage">
                    <div className="px-1 pb-1 text-[13px] font-bold text-primary">🗂️ {t('manage.title')}</div>
                    {[
                      canRequestService(user) && { key: 'requests', icon: '📋', label: t('nav.my_requests'), to: '/client' },
                      user.role === 'provider' && { key: 'tasks', icon: '🧰', label: t('work.tasks_title'), to: '/provider/tasks' },
                    ].filter(Boolean).map(g => (
                      <div key={g.key} className="flex items-center gap-2 px-1 py-1.5" data-testid={`menu-manage-${g.key}`}>
                        <span className="font-bold text-fg flex-1">{g.icon} {g.label}</span>
                        <Link to={g.to} onClick={() => setMobileOpen(false)} className="px-3 py-1.5 rounded-pill bg-surface text-[13px] font-semibold text-primary no-underline">🟢 {t('manage.active')}</Link>
                        <Link to={`${g.to}?tab=archive`} onClick={() => setMobileOpen(false)} className="px-3 py-1.5 rounded-pill bg-surface text-[13px] font-semibold text-fg-muted no-underline">🗄️ {t('manage.archive')}</Link>
                      </div>
                    ))}
                  </div>
                )}
                <Link to="/chat" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt" data-testid="mobile-chats">
                  💬 {t('chat.title')}{chatUnread > 0 ? ` (${chatUnread})` : ''}
                </Link>
                <Link to="/chat?archive=1" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt" data-testid="mobile-chat-archive">
                  🗄️ {t('requester.chat_archive')}
                </Link>
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt">
                  👤 {t('nav.profile')}
                </Link>
                {['client', 'provider'].includes(user.role) && (
                  <Link to="/profile#account-type" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt" data-testid="mobile-account-type">
                    🔁 {t('profile.change_account_type')}
                  </Link>
                )}
                {/* Writing to the administration (AYK-046), with the count of unread replies. */}
                <Link to="/support" onClick={() => setMobileOpen(false)} data-testid="mobile-support"
                  className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt flex items-center justify-between">
                  <span>📨 {t('support.title')}</span>
                  {supportCount > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center">{supportCount}</span>}
                </Link>
                <Link to="/disputes" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt">
                  ⚖️ {t('dispute.my_disputes')}
                </Link>
              </div>
            )}
            <div className="mt-3 mb-2 flex items-center justify-center gap-2">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
            {user ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to={dashLink}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-pill font-semibold bg-surface-alt text-fg text-center no-underline"
                >
                  {t('nav.dashboard')}
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); handleLogout(); }}
                  className="px-4 py-2.5 rounded-pill font-bold text-white bg-danger"
                >
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-pill font-semibold bg-surface-alt text-fg text-center no-underline"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-pill font-bold text-primary-fg text-center no-underline bg-primary-grad"
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </div>, document.body
      )}
    </header>
  );
}
