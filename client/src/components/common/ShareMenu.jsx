import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { flash } from './Flash';
import Modal from './Modal';

// AYK-382 (the owner, with a picture: «أضف في التطبيقات والموقع أيقونة مشاركة الموقع… ومشاركة مقدم
// الخدمة في لوحته»). One menu for sharing a link: the phone's own share sheet, WhatsApp, Telegram,
// Facebook, X, TikTok (which has no web share: the link is copied to paste there), copy the link,
// and a QR code drawn on the device (no outside service sees the link).

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove(); return ok;
  }
}

const Icon = ({ children, color }) => (
  <span aria-hidden="true" className="inline-grid place-items-center w-7 h-7 rounded-full shrink-0 text-[14px]" style={{ background: `${color}1a`, color }}>{children}</span>
);
const svg = path => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d={path} /></svg>;
const ICONS = {
  share: svg('M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z'),
  whatsapp: svg('M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z'),
  telegram: svg('M21.9 4.3 18.8 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.4-1 .4l.4-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L7.1 12.9 2.6 11.5c-1-.3-1-1 .2-1.5l17.7-6.8c.8-.3 1.6.2 1.4 1.1Z'),
  facebook: svg('M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V9c0-.6.4-1 1-1Z'),
  x: svg('M17.8 3H21l-7 8 8.2 10H16l-5-6.2L5.4 21H2.2l7.5-8.6L1.8 3h6.4l4.5 5.7L17.8 3Zm-1.1 16h1.8L7.4 4.9H5.5L16.7 19Z'),
  tiktok: svg('M16.6 3c.4 2.2 1.8 3.7 4.1 3.9v3.3c-1.5.1-2.9-.4-4.1-1.2v6.3a6.3 6.3 0 1 1-6.3-6.3h.7v3.4a3 3 0 1 0 2.2 2.9V3h3.4Z'),
  link: svg('M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0Zm-2.8 5.4a4 4 0 0 1-2.9-6.8l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a2 2 0 0 0 2.9 2.9l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a4 4 0 0 1-2.8 1.1Zm8.5-6.5a1 1 0 0 1-.7-1.7l2.1-2.1a2 2 0 0 0-2.9-2.9l-2.1 2.1a1 1 0 1 1-1.4-1.4l2.1-2.1a4 4 0 0 1 5.7 5.7L17 12a1 1 0 0 1-.7.3Z'),
  qr: svg('M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm-6 2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h2v2h-2v-2Zm2 2h2v2h-2v-2Z'),
};

export default function ShareMenu({ url, title = '', text = '', variant = 'button', label, className = '', testId = 'share-menu' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(null);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const message = text ? `${text}\n${url}` : url;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // The menu is placed by the button and kept inside the screen (it opens upward near the bottom).
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const place = () => {
      const r = trigger.current.getBoundingClientRect();
      const width = Math.min(260, window.innerWidth - 16);
      const height = panel.current?.offsetHeight || 380;
      const rtl = document.documentElement.dir !== 'ltr';
      let left = rtl ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const below = r.bottom + 6;
      const top = below + height > window.innerHeight - 8 && r.top - 6 - height > 8 ? r.top - 6 - height : Math.max(8, Math.min(below, window.innerHeight - height - 8));
      setPos({ left, top, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const done = () => setOpen(false);
  const copy = async (note = t('share.copied')) => { done(); flash(await copyText(url) ? `✅ ${note}` : url, 3000); };
  const nativeShare = async () => {
    done();
    try { await navigator.share({ title, text, url }); } catch (err) { if (err?.name !== 'AbortError') copy(); }
  };
  const showQr = async () => {
    done();
    try {
      const { toDataURL } = await import('qrcode');
      setQr(await toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' }));
    } catch (_) { copy(); }
  };
  const external = (href) => ({ href, target: '_blank', rel: 'noopener noreferrer', onClick: done });

  const line = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14.5px] font-semibold text-fg no-underline bg-transparent border-0 cursor-pointer text-start hover:bg-surface-alt focus-visible:bg-surface-alt';
  const enc = encodeURIComponent;
  const items = [
    canShare && <button key="native" type="button" className={line} onClick={nativeShare} data-testid={`${testId}-native`}><Icon color="#2563eb">{ICONS.share}</Icon>{t('share.native')}</button>,
    <a key="wa" className={line} {...external(`https://wa.me/?text=${enc(message)}`)} data-testid={`${testId}-whatsapp`}><Icon color="#16a34a">{ICONS.whatsapp}</Icon>{t('share.whatsapp')}</a>,
    <a key="tg" className={line} {...external(`https://t.me/share/url?url=${enc(url)}&text=${enc(text || title)}`)} data-testid={`${testId}-telegram`}><Icon color="#0284c7">{ICONS.telegram}</Icon>{t('share.telegram')}</a>,
    <a key="fb" className={line} {...external(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`)} data-testid={`${testId}-facebook`}><Icon color="#1d4ed8">{ICONS.facebook}</Icon>{t('share.facebook')}</a>,
    <a key="x" className={line} {...external(`https://twitter.com/intent/tweet?text=${enc(text || title)}&url=${enc(url)}`)} data-testid={`${testId}-x`}><Icon color="#111827">{ICONS.x}</Icon>{t('share.x')}</a>,
    <button key="tt" type="button" className={line} onClick={() => copy(t('share.tiktok_copied'))} data-testid={`${testId}-tiktok`}><Icon color="#111827">{ICONS.tiktok}</Icon><span className="flex-1">{t('share.tiktok')}</span><span className="text-[11px] font-normal text-fg-muted">{t('share.tiktok_hint')}</span></button>,
    <button key="copy" type="button" className={line} onClick={() => copy()} data-testid={`${testId}-copy`}><Icon color="#7c3aed">{ICONS.link}</Icon>{t('share.copy')}</button>,
    <button key="qr" type="button" className={line} onClick={showQr} data-testid={`${testId}-qr`}><Icon color="#334155">{ICONS.qr}</Icon>{t('share.qr')}</button>,
  ].filter(Boolean);

  const buttonLabel = label || t('share.title');
  return (
    <>
      {variant === 'round' ? (
        // AYK-451 (the owner: «وضّح المشاركة»): a round button the size of the contact icons beside it,
        // in its own fixed colour (as they are), so it reads as a button and not as a faint mark.
        <button ref={trigger} type="button" aria-label={buttonLabel} title={buttonLabel} aria-expanded={open} aria-haspopup="menu"
          onClick={() => setOpen(v => !v)} data-testid={testId}
          className={`inline-grid place-items-center rounded-pill border-0 cursor-pointer shrink-0 shadow-sm ${className}`}
          style={{ background: '#475569', color: '#ffffff', width: 36, height: 36, minWidth: 36, minHeight: 36, padding: 0 }}>
          {ICONS.share}
        </button>
      ) : variant === 'icon' || variant === 'icon-sm' ? (
        <button ref={trigger} type="button" aria-label={buttonLabel} title={buttonLabel} aria-expanded={open} aria-haspopup="menu"
          onClick={() => setOpen(v => !v)} data-testid={testId}
          // AYK-436: 'icon-sm' sits beside the round contact icons on cards (30 px, fixed slate).
          // AYK-451: filled in the same fixed slate as the card's round share button, so it is clear.
          className={`${variant === 'icon-sm' ? 'w-[30px] h-[30px] border-0 shadow-sm' : 'w-10 h-10 bg-transparent border-0 text-fg-muted hover:bg-surface-alt'} grid place-items-center rounded-pill cursor-pointer ${className}`}
          style={variant === 'icon-sm' ? { minHeight: 0, minWidth: 30, padding: 0, background: '#475569', color: '#ffffff' } : undefined}>
          {ICONS.share}
        </button>
      ) : (
        <button ref={trigger} type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(v => !v)} data-testid={testId}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-bold bg-surface-alt border border-border text-fg cursor-pointer ${className}`}>
          {ICONS.share} {buttonLabel}
        </button>
      )}
      {open && createPortal(
        <div ref={panel} role="menu" data-testid={`${testId}-panel`}
          className="fixed z-[1200] p-1.5 rounded-card bg-surface border border-border shadow-lg max-h-[80vh] overflow-y-auto"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden', left: 0, top: 0 }}>
          {items}
        </div>, document.body)}
      <Modal open={Boolean(qr)} onClose={() => setQr(null)} title={t('share.qr')}>
        <div className="text-center space-y-3" data-testid={`${testId}-qr-box`}>
          {qr && <img src={qr} alt={t('share.qr')} className="mx-auto w-64 h-64 rounded-xl border border-border bg-white" />}
          <p className="m-0 text-[13px] text-fg-muted">{t('share.qr_hint')}</p>
          <div dir="ltr" className="text-[12px] break-all text-fg-muted">{url}</div>
          {qr && <a href={qr} download="aykdmh-qr.png" className="btn btn-primary btn-sm">⬇️ {t('share.qr_save')}</a>}
        </div>
      </Modal>
    </>
  );
}
