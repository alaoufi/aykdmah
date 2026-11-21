import usePublicSettings, { paidAdsOn } from '../../hooks/usePublicSettings';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';
import { useNotifications } from '../../hooks/useNotifications';
import Avatar from '../common/Avatar';
import LanguageSwitcher from '../common/LanguageSwitcher';
import ShareMenu from '../common/ShareMenu';
import ThemeSwitcher from '../common/ThemeSwitcher';
import BrandLogo from '../common/BrandLogo';
import { IconMenu, IconBell, IconClose, IconChat } from '../common/Icons';
import AdminPanelLink from './AdminPanelLink';
import InviteButton from '../common/InviteButton';

export default function Header() {
  // AYK-405: «أعلن» in the account menus, only while paid ad subscriptions are on.
  const { settings: publicSettings } = usePublicSettings();
  const canAdvertise = paidAdsOn(publicSettings);
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
    { to: '/provider', label: t('nav.home'), end: true },
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
    // AYK-329 (the owner): the bar's background is a very light shade of the chosen theme colour (.site-header).
    <header className="site-header sticky top-0 z-40 backdrop-blur-md border-b border-border/70">
      <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 h-14 md:h-16 lg:h-[72px] flex items-center gap-2 md:gap-4">
        {/* Phones and tablets (owner): ☰ on the page's right edge, logo on the left edge. */}
        <Link to="/" className="site-logo xl:w-[166px] shrink-0 no-underline max-xl:order-5 max-xl:-me-1 max-xl:flex max-xl:justify-end">
          {/* AYK-319: the logo fits inside the bar (56/64/72 px) with an even margin, never over its line. */}
          <BrandLogo imgClassName="w-[38px] h-[38px] md:w-[42px] md:h-[42px] lg:w-[48px] lg:h-[48px]" />
        </Link>

        {/* Spacer pushes the logo to the opposite edge */}
        <div className="flex-1 max-xl:order-4" />

        {/* Mobile controls cluster — sits on the END edge */}
        {/* AYK-382: share the site (WhatsApp, Telegram, Facebook, X, TikTok, link, QR). */}
        <ShareMenu variant="icon" url={`${window.location.origin}/`} title={t('common.brand')} text={t('share.site_text')}
          label={t('share.site')} className="max-xl:order-3" testId="share-site" />
        <ThemeSwitcher variant="compact" className="md:hidden max-xl:order-3" />
        <LanguageSwitcher variant="compact" className="md:hidden max-xl:order-3" />
        {/* AYK-424 (the owner: «اعمل شعار المحادثات في الهيدر للدخول على المحادثات»): the chats icon beside the bell, with the unread chats count. */}
        {user && <Link to="/chat" data-testid="mobile-header-chat"
          className="md:hidden max-xl:order-2 relative w-10 h-10 inline-grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt no-underline" aria-label={t('nav.chat')} title={t('nav.chat')}>
          <IconChat size={18} />
          {chatUnread > 0 && <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">{chatUnread > 9 ? '9+' : chatUnread}</span>}
        </Link>}
        {/* The notifications bell on phones too: its count is not the chats count. `inline-grid`, not `grid`:
            the site's own `.grid` rule (global.css) beat `md:hidden`, so these showed twice on wide screens. */}
        {user && <Link to="/notifications" data-testid="mobile-bell"
          className="md:hidden max-xl:order-2 relative w-10 h-10 inline-grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt no-underline" aria-label={t('notification.title')}>
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
          {/* AYK-424: the chats have their icon beside the bell, so not a second time as a word here. */}
          {visibleLinks.filter((l) => l.to !== '/chat').map((l) => (
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
            <Link to="/chat" data-testid="header-chat" aria-label={t('nav.chat')} title={t('nav.chat')}
              className="relative w-10 h-10 grid place-items-center rounded-pill text-fg-muted hover:bg-surface-alt no-underline">
              <IconChat size={18} />
              {chatUnread > 0 && <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">{chatUnread > 9 ? '9+' : chatUnread}</span>}
            </Link>
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
                    {/* AYK-356 (the owner): «حسابي», the member's own account, instead of «لوحة التحكم». */}
                    <Link to={user.role === 'admin' ? dashLink : '/profile'} className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)} data-testid="menu-my-account">
                      👤 {t(user.role === 'admin' ? 'nav.dashboard' : 'nav.my_account')}
                    </Link>
                    {['client', 'provider'].includes(user.role) && (
                      <Link to="/profile#account-type" className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)} data-testid="menu-account-type">
                        🔁 {t('profile.change_account_type')}
                      </Link>
                    )}
                    {canAdvertise && ['client', 'provider'].includes(user.role) && (
                      <Link to="/promote" className="block px-3 py-2 rounded text-sm font-semibold text-fg hover:bg-surface-alt no-underline" onClick={() => setMenuOpen(false)} data-testid="menu-promote">
                        📣 {t('nav.promote')}
                      </Link>
                    )}
                    <AdminPanelLink className="w-full text-right px-3 py-2 rounded text-sm font-bold text-primary hover:bg-surface-alt" onDone={() => setMenuOpen(false)} />
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
            className="absolute top-3 inset-x-3 bg-surface rounded-[22px] shadow-card p-4 max-h-[calc(100%-24px)] overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}>
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
            {/* Who is signed in, by name (owner's request, AYK-293), then "your number" (it is also a
                sign-in identifier) and the user's area. */}
            {user && (
              <div className="mb-3 px-3 py-2.5 rounded-card bg-primary-soft" data-testid="menu-your-number">
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 mb-1.5 no-underline" data-testid="menu-user-name">
                  <Avatar src={user.avatar} name={user.full_name} />
                  <span className="min-w-0 text-[17px] font-extrabold text-fg truncate">{user.full_name}</span>
                </Link>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                {user.referral_code && (
                  <span className="text-[15px] text-fg">{t('brand.your_number')}: <b dir="ltr" className="tracking-wider text-[17px]">{user.referral_code}</b></span>
                )}
                {['client', 'provider'].includes(user.role) && (
                  <Link to="/profile#my-area" onClick={() => setMobileOpen(false)} className="text-[13px] font-semibold text-primary underline underline-offset-2" data-testid="edit-area">📍 {t('for_you.edit_area')}</Link>
                )}
                </div>
              </div>
            )}
            {/* "Manage" right under "your number" (AYK-075/076): what this member needs, by role. */}
            {user && (canRequestService(user) || user.role === 'provider') && (
              <div className="mb-3 p-2.5 rounded-card border-2 border-primary bg-primary-soft" data-testid="menu-manage">
                <div className="px-1 pb-1.5 text-[15px] font-extrabold text-primary">🗂️ {t('manage.title')}</div>
                {[
                  canRequestService(user) && { key: 'requests', icon: '📋', label: t('nav.my_requests'), to: '/client', extra: [
                    { to: '/requests/new', label: `➕ ${t('request.create_title')}` },
                    { to: '/directory', label: `📒 ${t('requester.directory_title')}`, testid: 'menu-directory' },
                    user.role !== 'provider' && { to: '/wallet', label: `💰 ${t('wallet.nav')}` },
                    user.role !== 'provider' && { to: '/wallet#invite', label: `🎁 ${t('wallet.invite_nav')}`, testid: 'menu-invite', invite: true },
                  ].filter(Boolean) },
                  user.role === 'provider' && { key: 'tasks', icon: '🧰', label: t('work.tasks_title'), to: '/provider/tasks', extra: [
                    { to: '/opportunities', label: `🔍 ${t('work.requests_nav')}` },
                    { to: '/profile#work', label: `🛠️ ${t('work.professions_areas')}` },
                    { to: '/provider/wallet', label: `💰 ${t('wallet.nav')}` },
                    { to: '/provider/wallet#invite', label: `🎁 ${t('wallet.invite_nav')}`, testid: 'menu-invite', invite: true },
                    { to: '/directory', label: `📒 ${t('requester.directory_title')}` },
                  ] },
                ].filter(Boolean).map(g => (
                  <div key={g.key} className="mb-1.5 last:mb-0 p-2 rounded-card bg-surface" data-testid={`menu-manage-${g.key}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg flex-1 text-[15px]">{g.icon} {g.label}</span>
                      <Link to={g.to} onClick={() => setMobileOpen(false)} className="px-3 py-1.5 rounded-pill bg-primary text-white text-[13px] font-semibold no-underline">{t(g.key === 'requests' ? 'manage.active_requests' : 'manage.active_tasks')}</Link>
                      <Link to={`${g.to}?tab=archive`} onClick={() => setMobileOpen(false)} className="px-3 py-1.5 rounded-pill bg-surface-alt text-[13px] font-semibold text-fg no-underline">🗄️ {t(g.key === 'requests' ? 'manage.archive_requests' : 'manage.archive_tasks')}</Link>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {g.extra.map(x => (x.invite && user.referral_code ? (
                        // AYK-355: «دعوة» opens copy / send at once, here.
                        <InviteButton key={x.to} code={user.referral_code} testid={x.testid}
                          className="px-3 py-1.5 rounded-pill border-2 border-primary text-[13px] font-bold text-fg bg-surface hover:bg-surface-alt" />
                      ) : (
                        <Link key={x.to} to={x.to} onClick={() => setMobileOpen(false)} data-testid={x.testid}
                          className="px-3 py-1.5 rounded-pill border border-border text-[13px] font-semibold text-fg no-underline hover:bg-surface-alt">{x.label}</Link>
                      )))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col">
              {/* In the ☰ menu these already sit in "Manage" and below (AYK-102). */}
              {visibleLinks.filter(l => !['/opportunities', '/chat'].includes(l.to)).map((l) => (
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
                {canAdvertise && ['client', 'provider'].includes(user.role) && (
                  <Link to="/promote" onClick={() => setMobileOpen(false)} className="text-right px-3 py-3 rounded-card font-semibold no-underline text-fg-muted hover:bg-surface-alt" data-testid="mobile-promote">
                    📣 {t('nav.promote')}
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
            {user && <AdminPanelLink className="w-full mb-2 px-4 py-2.5 rounded-pill font-bold bg-surface-alt text-primary text-center" onDone={() => setMobileOpen(false)} />}
            {user ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to={user.role === 'admin' ? dashLink : '/profile'}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-pill font-semibold bg-surface-alt text-fg text-center no-underline"
                  data-testid="mobile-my-account"
                >
                  👤 {t(user.role === 'admin' ? 'nav.dashboard' : 'nav.my_account')}
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
