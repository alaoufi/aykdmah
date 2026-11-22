import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inviteLink } from '../../utils/invite';

// AYK-371 (the owner: «دعوة عدّلها إلى دعوة للانضمام، وإذا ضغط عليها يظهر فوقها سطرين: نسخ، إرسال»).
// A tap shows two lines right above the button: «نسخ» copies the short invite link, «إرسال» opens
// WhatsApp with the invitation ready (AYK-355). A tap outside closes them.
export default function InviteButton({ code, className = '', testid = 'menu-invite', below = false, label = null, block = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef(null);
  const link = inviteLink(code);
  const text = t('wallet.share_text', { code, url: link });
  useEffect(() => {
    if (!open) return undefined;
    const away = event => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch (_) {
      const area = document.createElement('textarea'); area.value = link; document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); } catch (__) { /* nothing more to try */ } area.remove();
    }
    setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1400);
  };
  const line = 'flex items-center gap-2 w-full px-4 py-2.5 text-[14px] font-bold text-fg bg-transparent border-0 text-start no-underline hover:bg-surface-alt';
  return (
    <span ref={box} className={`relative ${block ? 'block' : 'inline-block'}`}>
      {open && (
        <span role="menu" data-testid="invite-menu"
          className={`absolute ${below ? 'top-full mt-2 inset-x-0' : 'bottom-full mb-2 start-0'} z-50 min-w-[150px] rounded-card border border-border bg-surface shadow-lift overflow-hidden divide-y divide-border`}>
          <button type="button" role="menuitem" className={line} onClick={copy} data-testid="invite-copy">📋 {copied ? t('wallet.invite_copied') : t('wallet.invite_copy')}</button>
          <a role="menuitem" className={line} target="_blank" rel="noopener noreferrer" data-testid="invite-send"
            href={`https://wa.me/?text=${encodeURIComponent(text)}`} onClick={() => setTimeout(() => setOpen(false), 300)}>💬 {t('wallet.invite_send_short')}</a>
        </span>
      )}
      <button type="button" data-testid={testid} aria-expanded={open} onClick={() => setOpen(value => !value)} className={className}>
        {label || <>🎁 {t('wallet.invite_nav')}</>}
      </button>
    </span>
  );
}
