import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { inviteLink } from '../../utils/invite';

// AYK-355 (the owner: «إذا ضغط على دعوة يظهر له نسخ / إرسال، والإرسال على الواتساب»): the menu's
// «🎁 دعوة» opens this at once: the short invite link, «نسخ الرابط» and «إرسال بالواتساب».
export default function InviteSheet({ code, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(code);
  const text = t('wallet.share_text', { code, url: link });
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) { /* clipboard blocked: the link is shown to select */ }
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-ink/50 grid place-items-end sm:place-items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('wallet.invite_title')} data-testid="invite-sheet"
        className="w-full sm:max-w-md bg-surface rounded-t-card sm:rounded-card p-5 pb-8 space-y-3 shadow-lift" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-fg m-0">🎁 {t('wallet.invite_title')}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <p className="text-[13px] text-fg-muted m-0">{t('wallet.invite_hint')}</p>
        <div dir="ltr" className="text-[15px] font-bold text-fg bg-surface-alt border border-border rounded-card px-3 py-2 break-all select-all" data-testid="invite-sheet-url">{link}</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-outline btn-lg" onClick={copy} data-testid="invite-sheet-copy">📋 {copied ? t('share_provider.copied') : t('share_provider.copy')}</button>
          <a className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer" data-testid="invite-sheet-whatsapp"
            href={`https://wa.me/?text=${encodeURIComponent(text)}`} onClick={() => setTimeout(onClose, 300)}>💬 {t('wallet.invite_send')}</a>
        </div>
      </div>
    </div>,
    document.body
  );
}
