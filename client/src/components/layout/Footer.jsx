import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLogo from '../common/BrandLogo';
import usePublicSettings from '../../hooks/usePublicSettings';

export default function Footer() {
  const { t } = useTranslation();
  const { settings } = usePublicSettings();
  const year = new Date().getFullYear();
  const contacts = [settings.support_phone, settings.support_email].filter(Boolean);

  const cols = [
    {
      title: t('footer.links'),
      links: [
        { to: '/', label: t('nav.home') },
        { to: '/services', label: t('nav.services') },
        { to: '/providers/map', label: t('map.nav_link') },
        { to: '/requests/new', label: t('nav.order_now') },
        { to: '/chat', label: t('nav.chat') },
        { to: '/profile', label: t('nav.profile') },
      ],
    },
    {
      title: t('auth.role_provider'),
      links: [
        { to: '/register?role=provider', label: t('nav.register') },
        { to: '/provider/subscription', label: t('nav.subscription') },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { to: '/guide', label: t('help.title') },
        { to: '/terms', label: t('footer.terms') },
        { to: '/privacy', label: t('footer.privacy') },
      ],
    },
  ];

  return (
    <footer className="site-footer bg-ink text-white/75 pt-14 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-4">
            <div className="mb-4">
              <BrandLogo width={190} tone="mono-light" tagline taglineText={t('common.tagline')} />
            </div>
            <p className="text-white/70 text-[13.5px] leading-relaxed">
              {t('footer.tagline')}
            </p>
          </div>

          {cols.map((c, i) => (
            <div key={i} className="md:col-span-2">
              <div className="text-white font-bold text-[14px] mb-3">{c.title}</div>
              <ul className="flex flex-col gap-2">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-white/70 hover:text-white text-[13px] transition no-underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {contacts.length > 0 && <div className="col-span-2 md:col-span-2">
            <div className="text-white font-bold text-[14px] mb-3">{t('footer.contact')}</div>
            <ul className="flex flex-col gap-2 text-[13px] text-white/70">
              {contacts.map((contact) => <li key={contact}>{contact}</li>)}
            </ul>
          </div>}
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-white/55">
          <div>© {year} {t('common.brand')}. {t('footer.all_rights_reserved')}.</div>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-white/75 hover:text-white transition no-underline">{t('footer.terms')}</Link>
            <Link to="/privacy" className="text-white/75 hover:text-white transition no-underline">{t('footer.privacy')}</Link>
            <Link to="/admin/login" className="text-white/75 hover:text-white transition no-underline">{t('nav.admin')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
