import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import usePublicSettings from '../../hooks/usePublicSettings';
import { useAuth } from '../../hooks/useAuth';
import { whatsappLink } from '../../utils/whatsapp';
import { logSupportWhatsApp } from '../../services/supportService';
import { CONTACT_COLORS } from '../providers/ContactButtons';
import { SITE_URL } from '../../utils/site';

// AYK-437 (the owner: «تواصل مع الدعم الفني يكون أيقونة واتس اب ويحوّل على رقم الدعم الفني، يُعدّل من
// الإعدادات، وتحفظ في قائمة يراجعها الدعم الفني»). The WhatsApp icon (fixed green) opens the support
// number from «الإعدادات» (support_whatsapp) with an introduction (who, and from which page), and the
// tap is kept for support to review (الإدارة ← الدعم الفني ← «تواصل واتساب»). Nothing when no number is set.
const WhatsAppIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.24-1.37A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.82.83-3.03-.2-.31a8.2 8.2 0 1 1 6.95 3.85Zm4.5-6.14c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.67.31 2.8 2.8 0 0 0-.87 2.08 4.86 4.86 0 0 0 1.02 2.58 11.1 11.1 0 0 0 4.26 3.76c1.58.68 2.2.74 3 .62.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29Z" />
  </svg>
);

export default function SupportWhatsApp({ variant = 'icon', className = '', testId = 'support-whatsapp-link' }) {
  const { t, i18n } = useTranslation();
  const { settings } = usePublicSettings();
  const { user } = useAuth();
  const location = useLocation();
  const number = String(settings.support_whatsapp || '').trim();
  if (!number) return null;
  const name = String(user?.full_name || '').trim().split(/\s+/).slice(0, 2).join(' ');
  const who = !user ? '' : user.role === 'provider' ? t('contact_intro.provider') : t('contact_intro.requester');
  const intro = user ? t('contact_intro.support', { name, who }) : t('contact_intro.support_visitor');
  const page = `${location.pathname}${location.search || ''}`;
  const message = `${intro}\n— ${t('contact_intro.via_site', { url: `${SITE_URL}${page}` })}`;
  const href = whatsappLink(number, message);
  if (!href) return null;
  const onClick = () => { logSupportWhatsApp({ page, message, lang: i18n.resolvedLanguage || '' }); };
  const label = t('support.whatsapp_icon');
  if (variant === 'float') {
    // AYK-468 (the owner: «اجعل شعار الواتس اب عائمًا مستمرًا بالزاوية السفلية، المكان المناسب»): always
    // on screen at the bottom corner on the reading side's end, above the phone's bottom bar.
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} data-testid={testId} aria-label={label} title={label}
        className={`ayk-support-float fixed z-[900] grid place-items-center rounded-full text-white shadow-lift ${className}`}
        style={{ background: CONTACT_COLORS.whatsapp, width: 54, height: 54, padding: 0, textDecoration: 'none' }}>
        <WhatsAppIcon size={30} />
      </a>
    );
  }
  if (variant === 'button') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} data-testid={testId}
        className={`inline-flex items-center gap-2 h-11 px-4 rounded-pill font-bold text-[14px] text-white no-underline ${className}`}
        style={{ background: CONTACT_COLORS.whatsapp, textDecoration: 'none' }}>
        <WhatsAppIcon size={20} /> {label}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} data-testid={testId} aria-label={label} title={label}
      className={`inline-grid place-items-center rounded-full text-white shrink-0 ${className}`}
      style={{ background: CONTACT_COLORS.whatsapp, width: 40, height: 40, minWidth: 40, minHeight: 40, padding: 0, textDecoration: 'none' }}>
      <WhatsAppIcon size={22} />
    </a>
  );
}
