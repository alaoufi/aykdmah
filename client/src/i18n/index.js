import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ar from './locales/ar.json';
import en from './locales/en.json';
import ur from './locales/ur.json';
import bn from './locales/bn.json';
import hi from './locales/hi.json';
import ml from './locales/ml.json';
import fil from './locales/fil.json';
import id from './locales/id.json';
import ne from './locales/ne.json';
import am from './locales/am.json';
import tr from './locales/tr.json';

// Single source of truth for languages enabled on the platform.
// Adding a new language here + a matching locale JSON file is the only
// step required to enable it across the entire UI.
// Ordered by how many service providers in the Kingdom speak each language
// (AYK-037); English, the shared fallback, closes the list.
export const SUPPORTED_LANGUAGES = [
  { code: 'ar', label: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'ur', label: 'اردو',    dir: 'rtl', flag: '🇵🇰' },
  { code: 'hi', label: 'हिन्दी',   dir: 'ltr', flag: '🇮🇳' },
  { code: 'bn', label: 'বাংলা',   dir: 'ltr', flag: '🇧🇩' },
  { code: 'ml', label: 'മലയാളം', dir: 'ltr', flag: '🇮🇳' },
  { code: 'fil', label: 'Filipino', dir: 'ltr', flag: '🇵🇭' },
  { code: 'id', label: 'Bahasa Indonesia', dir: 'ltr', flag: '🇮🇩' },
  { code: 'ne', label: 'नेपाली', dir: 'ltr', flag: '🇳🇵' },
  { code: 'am', label: 'አማርኛ', dir: 'ltr', flag: '🇪🇹' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr', flag: '🇹🇷' },
  { code: 'en', label: 'English', dir: 'ltr', flag: '🇬🇧' },
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
  const base = String(code || '').toLowerCase().split(/[-_]/)[0];
  const normalized = SUPPORTED_LANG_CODES.includes(base) ? base : 'ar';
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
  setMeta('property', 'og:locale', { ar: 'ar_SA', en: 'en_US', ur: 'ur_PK', hi: 'hi_IN', bn: 'bn_BD', ml: 'ml_IN', fil: 'fil_PH', id: 'id_ID', ne: 'ne_NP', am: 'am_ET', tr: 'tr_TR' }[normalized]);
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
      ml: { translation: ml },
      fil: { translation: fil },
      id: { translation: id },
      ne: { translation: ne },
      am: { translation: am },
      tr: { translation: tr },
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
