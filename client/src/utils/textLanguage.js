// The script a text is written in, as one of the site's languages (AYK-229). Mirrors the server's
// detectLanguageFallback: enough to know whether a request needs translating for this reader.
export function textLanguage(text) {
  const value = String(text || '');
  if (/[؀-ۿ]/.test(value)) return /[ٹپچڈڑژکگںھہۃیے]/.test(value) ? 'ur' : 'ar';
  if (/[ঀ-৿]/.test(value)) return 'bn';
  if (/[ഀ-ൿ]/.test(value)) return 'ml';
  if (/[ሀ-፿]/.test(value)) return 'am';
  if (/[ऀ-ॿ]/.test(value)) return 'hi';
  return /\p{L}/u.test(value) ? 'latin' : '';
}

// Whether a reader in `lang` needs the text translated. Latin-script texts are taken as English
// and Devanagari as Hindi; the server checks again before translating.
export function needsTranslation(text, lang) {
  const source = textLanguage(text);
  if (!source || !lang) return false;
  return source === 'latin' ? lang !== 'en' : source !== lang;
}
