import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// AYK-469/471: the Saudi Business Center authentication, certificate 0000338868. The owner: «اختر الأيقونة
// الصغيرة، ومكانها فوق أيقونة حسابي تمامًا» and «أبي نفس الأيقونة هذي بالضبط الموجودة في تربح».
// The centre's official seal is a small frame drawn by its own site, keyed by a token it issues to each
// store (the same code as eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js, without loading a script).
// Until this store's token is set, the same badge is drawn here and opens the centre's inquiry page.
export const SBC_CERT = '0000338868';
export const SBC_SEAL_TOKEN = '';
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

export default function SbcVerified() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').startsWith('ar') ? 'ar' : 'en';
  const label = `${t('footer.sbc_title')} — ${t('footer.sbc_number')} ${SBC_CERT}`;
  return (
    <div className="ayk-sbc-float fixed z-[900]" data-testid="sbc-float">
      {SBC_SEAL_TOKEN ? <OfficialSeal token={SBC_SEAL_TOKEN} lang={lang} /> : (
        <a href={`${SBC_BASE}/inquiry`} target="_blank" rel="noopener noreferrer" data-testid="sbc-badge" aria-label={label} title={label}
          className="ayk-sbc-badge" dir="rtl">
          <span className="ayk-sbc-chip"><img src="/sbc-emblem.svg" alt="" width="19" height="21" /></span>
          <span className="ayk-sbc-text">{t('footer.sbc_verified_store')}</span>
        </a>
      )}
    </div>
  );
}
