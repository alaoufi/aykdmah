import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ar from './locales/ar.json';
import en from './locales/en.json';
import ur from './locales/ur.json';
import bn from './locales/bn.json';
import hi from './locales/hi.json';

// Single source of truth for languages enabled on the platform.
// Adding a new language here + a matching locale JSON file is the only
// step required to enable it across the entire UI.
export const SUPPORTED_LANGUAGES = [
  { code: 'ar', label: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'en', label: 'English', dir: 'ltr', flag: '🇬🇧' },
  { code: 'ur', label: 'اردو',    dir: 'rtl', flag: '🇵🇰' },
  { code: 'bn', label: 'বাংলা',   dir: 'ltr', flag: '🇧🇩' },
  { code: 'hi', label: 'हिन्दी',   dir: 'ltr', flag: '🇮🇳' },
];

// Ordered fallbacks: if a key is missing we try these in order.
// Keep `ar` last as the project's original language.
export const FALLBACK_CHAIN = ['en', 'ar'];

export const SUPPORTED_LANG_CODES = SUPPORTED_LANGUAGES.map(l => l.code);

export const LANG_STORAGE_KEY = 'lsm_lang';

export function getLanguageDir(code) {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang ? lang.dir : 'ltr';
}

export function applyLanguageToDocument(code) {
  if (typeof document === 'undefined') return;
  const normalized = SUPPORTED_LANG_CODES.includes(code?.slice(0, 2)) ? code.slice(0, 2) : 'ar';
  document.documentElement.lang = normalized;
  document.documentElement.dir = getLanguageDir(normalized);
  const title = `${i18n.t('common.brand', { lng: normalized })} — ${i18n.t('common.tagline', { lng: normalized })}`;
  const description = i18n.t('meta.description', { lng: normalized });
  document.title = title;
  const setMeta = (attribute, key, value) => {
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.setAttribute('content', value);
  };
  setMeta('name', 'description', description);
  setMeta('property', 'og:locale', { ar: 'ar_SA', en: 'en_US', ur: 'ur_PK', hi: 'hi_IN', bn: 'bn_BD' }[normalized]);
  setMeta('property', 'og:site_name', i18n.t('common.brand', { lng: normalized }));
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
      ur: { translation: ur },
      bn: { translation: bn },
      hi: { translation: hi },
    },
    fallbackLng: FALLBACK_CHAIN,
    supportedLngs: SUPPORTED_LANG_CODES,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnEmptyString: false,
    // never expose raw keys to users
    parseMissingKeyHandler: (key) => key.split('.').pop(),
  });

i18n.on('languageChanged', applyLanguageToDocument);
applyLanguageToDocument(i18n.language);

export default i18n;
