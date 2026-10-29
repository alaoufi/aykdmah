import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { IconHome, IconGrid, IconPlus, IconChat, IconUser, IconBell, IconSearch } from '../common/Icons';
import { pageZoom } from '../../utils/pageZoom';
import { canRequestService } from '../../utils/canRequest';

export default function BottomNav() {
  const navRef = useRef(null);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unread } = useNotifications();
  // Admins go to their panel; everyone else opens their own profile (account type, area, password).
  const accountLink = user?.role === 'admin' ? '/admin' : '/profile';

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let frame = 0;
    const updatePosition = () => {
      frame = 0;
      // Viewport offsets are relative to the layout viewport. pageTop/scrollY
      // would make this fixed navigation drift when the document is scrolled.
      const nav = navRef.current;
      if (!nav) return;
      const zoom = pageZoom();
      nav.style.setProperty('--mobile-nav-viewport-bottom', `${(viewport.offsetTop + viewport.height) / zoom}px`);
      nav.style.setProperty('--mobile-nav-viewport-left', `${viewport.offsetLeft / zoom}px`);
      nav.style.setProperty('--mobile-nav-viewport-width', `${viewport.width / zoom}px`);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    viewport.addEventListener('resize', scheduleUpdate, { passive: true });
    viewport.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', scheduleUpdate);
      viewport.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  // A provider-only account sees only its own work: its panel, the requests in its
  // professions and districts, and never the catalogue of other professions (AYK-040).
  const requester = canRequestService(user);
  const items = [
    ...(requester ? [
      { id: 'home', to: '/', label: t('nav.home'), Icon: IconHome, end: true },
      // Signed in, a requester's second tab is their own directory (AYK-041).
      user ? { id: 'services', to: '/directory', label: t('requester.directory_nav'), Icon: IconGrid }
        : { id: 'services', to: '/services', label: t('nav.services'), Icon: IconGrid },
      { id: 'request', to: '/requests/new', label: t('nav.order_now'), Icon: IconPlus, fab: true },
    ] : [
      { id: 'home', to: '/provider', label: t('work.title'), Icon: IconHome, end: true },
      { id: 'services', to: '/notifications', label: t('nav.notifications'), Icon: IconBell },
      { id: 'request', to: '/opportunities', label: t('work.requests_nav'), Icon: IconSearch, fab: true },
    ]),
    { id: 'chat', to: user ? '/chat' : '/login', label: t('nav.chat'), Icon: IconChat, badge: unread },
    { id: 'account', to: user ? accountLink : '/login', label: user ? t('nav.profile') : t('nav.login'), Icon: IconUser },
  ];

  return createPortal(
    <nav ref={navRef} data-testid="mobile-bottom-nav" aria-label={t('footer.links')} className="mobile-bottom-nav md:hidden z-40 safe-bottom">
      <div className="mx-2 mb-2 bg-surface/95 backdrop-blur-md border border-border rounded-[22px] shadow-card">
        <ul className="grid grid-cols-5 items-end h-[68px] px-1.5">
          {items.map((it) => {
            const I = it.Icon;
            if (it.fab) {
              return (
                <li key={it.id} className="flex justify-center -mt-7">
                  <NavLink
                    to={it.to}
                    className="w-[58px] h-[58px] rounded-full grid place-items-center text-primary-fg shadow-lift active:scale-95 transition no-underline bg-primary-grad"
                    aria-label={it.label}
                  >
                    <I size={26} stroke={2.6} />
                  </NavLink>
                </li>
              );
            }
            return (
              <li key={it.id} className="flex">
                <NavLink
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-card transition no-underline ${
                      isActive ? 'text-primary' : 'text-fg-subtle hover:text-fg'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="relative">
                        <I size={22} stroke={isActive ? 2.4 : 2} />
                        {it.badge > 0 && (
                          <span className="absolute -top-1 -left-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[9px] font-bold grid place-items-center">
                            {it.badge > 9 ? '9+' : it.badge}
                          </span>
                        )}
                      </span>
                      <span className="text-[10.5px] font-bold">{it.label}</span>
                      {isActive && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>,
    document.body,
  );
}
