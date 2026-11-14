// The script a text is written in, as one of the site's languages (AYK-229). Mirrors the server's
// detectLanguageFallback: enough to know whether a request needs translating for this reader.
export function textLanguage(text) {
  const value = String(text || '');
  if (/[؀-ۿ]/.test(value)) return /[ٹپچڈڑژکگںھہۃیے]/.test(value) ? 'ur' : 'ar';
  if (/[ঀ-৿]/.test(value)) return 'bn';
  if (/[ഀ-ൿ]/.test(value)) return 'ml';
  if (/[ሀ-፿]/.test(value)) return 'am';
  if (/[ऀ-ॿ]/.test(value)) return 'devanagari';
  return /\p{L}/u.test(value) ? 'latin' : '';
}

// Scripts that one language alone uses: a text in one of them is in that language.
const UNIQUE_SCRIPT = new Set(['ar', 'ur', 'bn', 'ml', 'am']);

// Whether a reader in `lang` may need the text translated. Latin letters (English, Filipino,
// Indonesian, Turkish) and Devanagari (Hindi, Nepali) are shared by several languages, so those
// are asked of the server, whose translator detects the language (AYK-231).
export function needsTranslation(text, lang) {
  const source = textLanguage(text);
  if (!source || !lang) return false;
  return !(UNIQUE_SCRIPT.has(source) && source === lang);
}
