import { useTranslation } from 'react-i18next';

// AYK-469..474: the Saudi Business Center authentication of «أي خدمة», certificate 0000338868.
// The owner: «اختر الأيقونة الصغيرة، ومكانها فوق أيقونة حسابي تمامًا», «أبي نفس الأيقونة … الموجودة في تربح»,
// and «لا تهمني صفحة QR، الذي يهمني صفحة البيانات تفتح مباشرة»: the badge has the look of the centre's seal and
// opens the certificate page itself. Its address expires, so the server takes a fresh one from the centre's
// seal (server/services/sbcSeal.js) and sends the visitor on.
export const SBC_CERT = '0000338868';

export default function SbcVerified() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').startsWith('ar') ? 'ar' : 'en';
  const label = `${t('footer.sbc_title')} — ${t('footer.sbc_number')} ${SBC_CERT}`;
  return (
    <div className="ayk-sbc-float fixed z-[900]" data-testid="sbc-float">
      <a href={`/api/verified?lang=${lang}`} target="_blank" rel="noopener noreferrer" data-testid="sbc-badge"
        aria-label={label} title={label} className="ayk-sbc-badge" dir="rtl">
        <span className="ayk-sbc-chip"><img src="/sbc-emblem.svg" alt="" width="19" height="21" /></span>
        <span className="ayk-sbc-text">{t('footer.sbc_verified_store')}</span>
      </a>
    </div>
  );
}
