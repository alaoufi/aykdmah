import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLogo from '../common/BrandLogo';
import usePublicSettings, { subscriptionsOn } from '../../hooks/usePublicSettings';
import { nativeAppVersion } from '../../utils/nativeApp';
import AdSlot from '../ads/AdSlot';
import AdminPanelLink from './AdminPanelLink';
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
    <footer className="site-footer bg-ink text-white/75 pt-14 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <AdSlot placement="footer" className="mb-8" />
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

          {(contacts.length > 0 || inquiry) && <div className="col-span-2 md:col-span-2">
            <div className="text-white font-bold text-[14px] mb-3">{t('footer.contact')}</div>
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
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-white/55">
          <div>
            <div className="mb-1">
              {t('footer.branch_of_before')} <a href="https://trbhh.sa" target="_blank" rel="noopener" className="text-white/80 hover:text-white underline font-bold">{t('footer.parent_site')}</a>
            </div>
            © {year} {t('common.brand')}. {t('footer.all_rights_reserved')}.
            {/* The deployed release (commit and date), set by deploy/setup-server.sh. */}
            {import.meta.env.VITE_APP_VERSION && (
              <span className="ms-2 text-white/40 text-[11px]" data-testid="app-version">
                · {t('footer.version')} <span dir="ltr" title={import.meta.env.VITE_APP_BUILD || undefined}>{import.meta.env.VITE_APP_VERSION}</span>
                {nativeAppVersion() && <> · {t('footer.app_version')} <span dir="ltr">{nativeAppVersion()}</span></>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-white/75 hover:text-white transition no-underline">{t('footer.terms')}</Link>
            <Link to="/privacy" className="text-white/75 hover:text-white transition no-underline">{t('footer.privacy')}</Link>
            {/* Only accounts with admin rights see the admin link (AYK-210); /admin/login stays reachable by its address. */}
            <AdminPanelLink className="text-white/75 hover:text-white transition bg-transparent border-0 p-0 cursor-pointer" />
          </div>
        </div>
      </div>
    </footer>
  );
}
