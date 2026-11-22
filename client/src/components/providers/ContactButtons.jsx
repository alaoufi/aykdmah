import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappLink } from '../../utils/whatsapp';

// AYK-427 (the owner: «في ملف مقدم الخدمة وطالب الخدمة أضف التواصل واضح»): on the provider's page and
// on a request's page the ways to reach the person are shown as buttons, one tap each, not hidden in
// a menu: a call and WhatsApp only when that person chose to show them (AYK-314, AYK-418), and the
// chat inside the site always.
// The owner's rule (2026-11-22, «قاعدة عممها: أي لوحة يكون فيها تواصل واضح»): every panel that shows
// a person shows these buttons. `size`: 'lg' (a person's page), 'sm' (a card), 'xs' (a request card's line).
export default function ContactButtons({ phone = null, whatsapp = null, onChat, busy = false, title = null, testId = 'contact-buttons', size = 'lg', className = '' }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const chatLink = whatsappLink(whatsapp);
  const button = {
    lg: 'flex-1 min-w-[96px] h-11 text-[14px] gap-1.5',
    sm: 'h-9 px-3.5 text-[13px] gap-1',
    xs: 'h-7 px-2.5 text-[12px] gap-1',
  }[size] + ' inline-flex items-center justify-center rounded-pill font-bold no-underline whitespace-nowrap';
  return (
    <div className={`space-y-1.5 ${className}`} data-testid={testId} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {title && <div className="text-[13px] font-extrabold text-fg">{title}</div>}
      <div className={`flex flex-wrap ${size === 'lg' ? 'gap-2' : 'gap-1.5'}`}>
        {phone && (
          <a href={`tel:${phone}`} className={`${button} bg-sky-600 text-white`} data-testid={`${testId}-phone`}>
            <span aria-hidden="true">📞</span> {t('provider_contact.call')}
          </a>
        )}
        {chatLink && (
          <a href={chatLink} target="_blank" rel="noopener noreferrer" className={`${button} bg-[#25D366] text-white`} data-testid={`${testId}-whatsapp`}>
            <span aria-hidden="true">✆</span> {t('provider_contact.whatsapp_button')}
          </a>
        )}
        <button type="button" className={`${button} bg-primary text-primary-fg border-0 cursor-pointer disabled:opacity-60`} style={{ minHeight: 0 }}
          disabled={busy || opening} aria-busy={busy || opening} data-testid={`${testId}-chat`}
          onClick={async () => { setOpening(true); try { await onChat?.(); } finally { setOpening(false); } }}>
          {busy || opening
            ? <><span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" /> {t('provider_contact.opening')}</>
            : <><span aria-hidden="true">💬</span> {t('provider_contact.chat')}</>}
        </button>
      </div>
    </div>
  );
}
