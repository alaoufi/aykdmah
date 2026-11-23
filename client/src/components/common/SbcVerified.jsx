import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// AYK-469/471: the Saudi Business Center authentication, certificate 0000338868. The owner: «اختر الأيقونة
// الصغيرة، ومكانها فوق أيقونة حسابي تمامًا» and «أبي نفس الأيقونة هذي بالضبط الموجودة في تربح».
// The centre's official seal is a small frame drawn by its own site, keyed by a token it issues to each
// store (the same code as eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js, without loading a script).
// Until this store's token is set, the same badge is drawn here and opens the centre's inquiry page.
export const SBC_CERT = '0000338868';
export const SBC_SEAL_TOKEN = '';
// From the centre's own certificate page (searched 2026-11-23): store link and expiry. After this date the
// card stops saying «سارية» (it cannot check live without the seal token).
export const SBC_STORE_URL = 'https://aykdmh.com';
export const SBC_EXPIRES = '2027-01-09';
const INQUIRY = `https://eauthenticate.saudibusiness.gov.sa/inquiry`;
const SBC_BASE = 'https://eauthenticate.saudibusiness.gov.sa';

function OfficialSeal({ token, lang }) {
  const ref = useRef(null);
  useEffect(() => {
    // The seal asks to grow when opened (its card) and to shrink back; only messages from our frame count.
    const onMessage = (e) => {
      const f = ref.current;
      if (!f || e.origin !== SBC_BASE || e.source !== f.contentWindow || !e.data || e.data.sbcSeal !== true) return;
      if (e.data.width) f.style.width = `${Number(e.data.width)}px`;
      if (e.data.height) f.style.height = `${Number(e.data.height)}px`;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <iframe ref={ref} title="SBC Verification" loading="lazy" scrolling="no" data-testid="sbc-seal-frame"
      src={`${SBC_BASE}/EAuthSealApi/seal?token=${encodeURIComponent(token)}&lang=${lang}&pos=bottom`}
      style={{ border: 0, width: 120, height: 44, maxWidth: 'calc(100vw - 24px)', display: 'block', background: 'transparent', transition: 'width .18s ease,height .18s ease' }} />
  );
}

// AYK-472 (the owner, with trbhh's opened seal: «أول ضغط على أيقونة متجر موثّق تظهر هذه مع بياناته، وعند الضغط على
// عرض التحقق يفتح الصفحة بإضافة رقم الشهادة»): a card like the seal's. The centre's search needs its own human
// check on every search and its details links expire within the hour, so «عرض التحقق» copies the number and
// opens the centre's inquiry page with a line telling the visitor to paste it.
function SealCard({ onClose }) {
  const { t, i18n } = useTranslation();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const valid = Date.now() < new Date(`${SBC_EXPIRES}T23:59:59+03:00`).getTime();
  useEffect(() => {
    let alive = true;
    import('qrcode').then(({ toDataURL }) => toDataURL(INQUIRY, { margin: 0, width: 300, color: { dark: '#0f1a3c', light: '#ffffff' } }))
      .then((url) => { if (alive) setQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const expires = new Date(`${SBC_EXPIRES}T12:00:00+03:00`).toLocaleDateString(i18n.resolvedLanguage === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : (i18n.resolvedLanguage || 'en'), { year: 'numeric', month: '2-digit', day: '2-digit' });
  const view = async () => {
    try { await navigator.clipboard.writeText(SBC_CERT); setCopied(true); } catch (_) { setCopied(true); }
    window.open(INQUIRY, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="ayk-sbc-card" role="dialog" aria-label={t('footer.sbc_title')} data-testid="sbc-card" dir={i18n.dir()}>
      <button type="button" className="ayk-sbc-close" onClick={onClose} aria-label={t('common.close')} data-testid="sbc-card-close">×</button>
      <img src="/sbc-emblem.svg" alt="" width="34" height="37" className="mx-auto mb-1 block" style={{ filter: 'brightness(0) invert(1)' }} />
      <div className="text-[12px] text-white/75 mb-3">{t('footer.sbc_title')}</div>
      <div className="text-[17px] font-bold" style={{ color: '#47CD89' }}>{t('common.brand')}</div>
      <div className="text-[16px] font-bold text-white" dir="ltr">{SBC_STORE_URL}</div>
      <div className={`ayk-sbc-qr ${valid ? '' : 'is-off'}`}>
        <div className="ayk-sbc-qr-in">{qr ? <img src={qr} alt="" width="150" height="150" /> : <span className="w-[150px] h-[150px] block" />}</div>
      </div>
      <div className="ayk-sbc-pill">{t('footer.sbc_number')} <b dir="ltr">{SBC_CERT}</b></div>
      {valid && <div className="text-[13px] font-semibold text-white mt-3">{t('footer.sbc_valid_until', { date: expires })}</div>}
      <button type="button" className="ayk-sbc-view" onClick={view} data-testid="sbc-view">{t('footer.sbc_view')}</button>
      {copied && <div className="text-[12px] text-white/85 mt-2" data-testid="sbc-copied">{t('footer.sbc_copied', { number: SBC_CERT })}</div>}
    </div>
  );
}

export default function SbcVerified() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const lang = (i18n.resolvedLanguage || 'ar').startsWith('ar') ? 'ar' : 'en';
  const label = `${t('footer.sbc_title')} — ${t('footer.sbc_number')} ${SBC_CERT}`;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="ayk-sbc-float fixed z-[900]" data-testid="sbc-float">
      {SBC_SEAL_TOKEN ? <OfficialSeal token={SBC_SEAL_TOKEN} lang={lang} /> : (
        <>
          {open && <SealCard onClose={() => setOpen(false)} />}
          <button type="button" onClick={() => setOpen((v) => !v)} data-testid="sbc-badge" aria-label={label} title={label}
            aria-expanded={open} className="ayk-sbc-badge" dir="rtl">
            <span className="ayk-sbc-chip"><img src="/sbc-emblem.svg" alt="" width="19" height="21" /></span>
            <span className="ayk-sbc-text">{t('footer.sbc_verified_store')}</span>
          </button>
        </>
      )}
    </div>
  );
}
