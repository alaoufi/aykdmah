import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappLink } from '../../utils/whatsapp';

// AYK-427 (the owner: «في ملف مقدم الخدمة وطالب الخدمة أضف التواصل واضح»): the ways to reach a person
// are buttons, one tap each, not hidden in a menu: a call and WhatsApp only when that person chose to
// show them (AYK-314, AYK-418), and the chat inside the site always.
// The owner's rule (2026-11-22, «قاعدة عممها: أي لوحة يكون فيها تواصل واضح»): every panel that shows
// a person shows these buttons. `size`: 'lg' (a person's page), 'sm' (a card), 'xs' (a request card's line).
// AYK-430 (the owner: «جرّب أيقونات جوال، واتس اب، محادثة، المتاح منها، وتكون ألوانها ثابتة لا تتغير
// مع القالب»): each button has its icon and its own fixed colour, the same in every theme.
export const CONTACT_COLORS = Object.freeze({ phone: '#0369a1', whatsapp: '#25D366', chat: '#4338ca' });

const PhoneIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
  </svg>
);
const WhatsAppIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.24-1.37A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.82.83-3.03-.2-.31a8.2 8.2 0 1 1 6.95 3.85Zm4.5-6.14c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.67.31 2.8 2.8 0 0 0-.87 2.08 4.86 4.86 0 0 0 1.02 2.58 11.1 11.1 0 0 0 4.26 3.76c1.58.68 2.2.74 3 .62.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29Z" />
  </svg>
);
const ChatIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4.3 21.5a.5.5 0 0 0 .7.55l4.1-2.06c.93.24 1.9.37 2.9.37 5.5 0 10-3.9 10-8.7S17.5 3 12 3Zm-4.5 9.9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm4.5 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm4.5 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z" />
  </svg>
);

// AYK-431 (the owner: «مشوّهة كبيرة، اعملها أيقونات»): on cards (`size` 'sm' and 'xs') the buttons are
// round icons only, each with its fixed colour and its name for screen readers and on long press;
// the person's page ('lg') keeps the icon with its word. Sizes are set inline so the site's general
// link and button styles (underline, minimum height, padding) cannot stretch them.
export default function ContactButtons({ phone = null, whatsapp = null, onChat, busy = false, title = null, testId = 'contact-buttons', size = 'lg', className = '' }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const chatLink = whatsappLink(whatsapp);
  const round = size !== 'lg';
  const box = size === 'xs' ? 30 : 36;
  const icon = round ? (size === 'xs' ? 15 : 18) : 18;
  const look = color => (round
    ? { background: color, color: '#ffffff', width: box, height: box, minWidth: box, minHeight: box, padding: 0, borderRadius: 9999, textDecoration: 'none', lineHeight: 1 }
    : { background: color, color: '#ffffff', minHeight: 0, textDecoration: 'none' });
  const cls = round
    ? 'inline-grid place-items-center border-0 cursor-pointer shrink-0 shadow-sm'
    : 'flex-1 min-w-[96px] h-11 text-[14px] gap-1.5 inline-flex items-center justify-center rounded-pill font-bold whitespace-nowrap border-0 cursor-pointer';
  const label = key => (round ? null : <span>{t(key)}</span>);
  const spinner = <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />;
  return (
    <div className={`${round ? 'inline-flex items-center gap-1.5' : 'space-y-1.5'} ${className}`} data-testid={testId}
      onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {title && <div className="text-[13px] font-extrabold text-fg">{title}</div>}
      <div className={round ? 'inline-flex items-center gap-1.5' : 'flex flex-wrap gap-2'}>
        {phone && (
          <a href={`tel:${phone}`} className={cls} style={look(CONTACT_COLORS.phone)} data-testid={`${testId}-phone`}
            aria-label={t('provider_contact.call')} title={t('provider_contact.call')}>
            <PhoneIcon size={icon} />{label('provider_contact.mobile')}
          </a>
        )}
        {chatLink && (
          <a href={chatLink} target="_blank" rel="noopener noreferrer" className={cls} style={look(CONTACT_COLORS.whatsapp)} data-testid={`${testId}-whatsapp`}
            aria-label={t('provider_contact.whatsapp_button')} title={t('provider_contact.whatsapp_button')}>
            <WhatsAppIcon size={icon} />{label('provider_contact.whatsapp_button')}
          </a>
        )}
        <button type="button" className={`${cls} disabled:opacity-60`} style={look(CONTACT_COLORS.chat)}
          disabled={busy || opening} aria-busy={busy || opening} data-testid={`${testId}-chat`}
          aria-label={t('provider_contact.chat')} title={t('provider_contact.chat')}
          onClick={async () => { setOpening(true); try { await onChat?.(); } finally { setOpening(false); } }}>
          {busy || opening ? <>{spinner}{round ? null : <span>{t('provider_contact.opening')}</span>}</> : <><ChatIcon size={icon} />{label('provider_contact.chat')}</>}
        </button>
      </div>
    </div>
  );
}
