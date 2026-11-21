import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StoreBadges from '../home/StoreBadges';
import usePublicSettings, { subscriptionsOn } from '../../hooks/usePublicSettings';
import AdSlot from '../ads/AdSlot';
import AdminPanelLink from './AdminPanelLink';
import VisitorCounter from './VisitorCounter';
import { whatsappLink } from '../../utils/whatsapp';

export default function Footer() {
  const { t } = useTranslation();
  const { settings } = usePublicSettings();
  const year = new Date().getFullYear();
  const contacts = [settings.support_phone, settings.support_email].filter(Boolean);
  // «للاستفسار» with the support WhatsApp number from the admin settings (AYK-214).
  const inquiry = String(settings.support_whatsapp || '').trim();
  const inquiryLink = whatsappLink(inquiry, t('support.whatsapp_text'));

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
        ...(subscriptionsOn(settings) ? [{ to: '/provider/subscription', label: t('nav.subscription') }] : []),
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { to: '/guide', label: t('help.title') },
        { to: '/support', label: t('support.title') },
        { to: '/terms', label: t('footer.terms') },
        { to: '/privacy', label: t('footer.privacy') },
      ],
    },
  ];

  return (
    <footer className="site-footer text-white/75 pt-8 md:pt-14 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <AdSlot placement="footer" className="mb-8" />
        {/* AYK-341 (the owner): no logo here (it is in the bar at the top), the app downloads instead,
            and the links in columns side by side with the lines close together. */}
        <div className="grid grid-cols-3 md:grid-cols-12 gap-x-4 gap-y-6 md:gap-10">
          {cols.map((c, i) => (
            <div key={i} className="md:col-span-2 min-w-0">
              <div className="text-white font-bold text-[14px] mb-2">{c.title}</div>
              <ul className="flex flex-col gap-1">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="inline-block py-0.5 text-white/75 hover:text-white text-[13px] leading-snug transition no-underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(contacts.length > 0 || inquiry) && <div className="col-span-3 md:col-span-2">
            <div className="text-white font-bold text-[14px] mb-2">{t('footer.contact')}</div>
            <ul className="flex flex-col gap-2 text-[13px] text-white/70">
              {inquiry && (
                <li data-testid="footer-inquiry">
                  {t('footer.inquiry')}{' '}
                  {inquiryLink
                    ? <a href={inquiryLink} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-white font-bold hover:underline no-underline">( {inquiry} )</a>
                    : <span dir="ltr" className="text-white font-bold">( {inquiry} )</span>}
                </li>
              )}
              {contacts.map((contact) => <li key={contact}>{contact}</li>)}
            </ul>
          </div>}
          <StoreBadges footer className="col-span-3 md:col-span-4" />
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-white/55">
          <div>
            <div className="mb-1">
              {t('footer.branch_of_before')} <a href="https://trbhh.sa" target="_blank" rel="noopener" className="text-white/80 hover:text-white underline font-bold">{t('footer.parent_site')}</a>
            </div>
            <VisitorCounter className="mb-1 text-white/70" />
            © {year} {t('common.brand')}. {t('footer.all_rights_reserved')}.
            {/* The deployed release (commit and date), set by deploy/setup-server.sh. */}
            {import.meta.env.VITE_APP_VERSION && (
              <span className="ms-2 text-white/40 text-[11px]" data-testid="app-version">
                · {t('footer.version')} <span dir="ltr" title={import.meta.env.VITE_APP_BUILD || undefined}>{import.meta.env.VITE_APP_VERSION}</span>
                {/* One number for everyone, the site's (owner's decision, AYK-284): what people use is the
                    site, on the web and inside the Android and iPhone apps alike, and it changes with every
                    release without the stores. The app's own number stays in the admin devices log. */}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Only accounts with admin rights see the admin link (AYK-210); /admin/login stays reachable by its address. */}
            <AdminPanelLink className="text-white/75 hover:text-white transition bg-transparent border-0 p-0 cursor-pointer" />
          </div>
        </div>
      </div>
    </footer>
  );
}
