import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappLink } from '../../utils/whatsapp';

// AYK-379 (the owner: «التواصل يعرض ثلاث حالات: جوال إذا متاح، واتساب إذا متاح، محادثة»). The
// «تواصل» button opens three lines: the mobile number and WhatsApp only when the provider chose to
// show them (AYK-314), and the chat inside the site always.
export default function ContactMenu({ phone = null, whatsapp = null, onChat, busy = false, className = '', testId = 'contact-menu' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const chatLink = whatsappLink(whatsapp);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const line = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-semibold text-fg no-underline bg-transparent border-0 cursor-pointer text-start hover:bg-surface-alt disabled:opacity-60';
  return (
    <div ref={box} className={`relative inline-block ${className}`} data-testid={testId}>
      <button type="button" className="btn btn-primary btn-sm" aria-expanded={open} disabled={busy}
        onClick={() => setOpen(value => !value)} data-testid={`${testId}-button`}>
        💬 {t('provider_page.contact')} <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute z-30 mt-2 start-0 min-w-[230px] max-w-[85vw] p-1.5 rounded-card bg-surface border border-border shadow-lg">
          {phone && (
            <a role="menuitem" href={`tel:${phone}`} className={line} data-testid={`${testId}-phone`} onClick={() => setOpen(false)}>
              <span aria-hidden="true">📞</span>
              <span className="flex-1">{t('provider_contact.mobile')}</span>
              <bdi dir="ltr" className="text-[12.5px] text-fg-muted font-normal">{phone}</bdi>
            </a>
          )}
          {chatLink && (
            <a role="menuitem" href={chatLink} target="_blank" rel="noopener noreferrer" className={line} data-testid={`${testId}-whatsapp`} onClick={() => setOpen(false)}>
              <span aria-hidden="true" className="inline-block w-[18px] h-[18px] rounded-full bg-[#25D366] text-white text-[11px] leading-[18px] text-center">✆</span>
              <span className="flex-1">{t('provider_contact.whatsapp_button')}</span>
              <bdi dir="ltr" className="text-[12.5px] text-fg-muted font-normal">{whatsapp}</bdi>
            </a>
          )}
          <button role="menuitem" type="button" className={line} disabled={busy} data-testid={`${testId}-chat`}
            onClick={async () => { setOpen(false); await onChat?.(); }}>
            <span aria-hidden="true">💬</span>
            <span className="flex-1">{t('provider_contact.chat')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
