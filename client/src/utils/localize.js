import referenceNames from '../data/referenceNames.json' with { type: 'json' };

const hasText = value => typeof value === 'string' && Boolean(value.trim());
const languageCode = lang => typeof lang === 'string'
  ? lang.trim().toLowerCase().split(/[-_]/)[0] || 'ar'
  : 'ar';

const referenceKey = (ar, en) => JSON.stringify([ar, en]);
const nameReferences = new Map();
for (const entry of [...referenceNames.catalog, ...referenceNames.geography, ...referenceNames.plans]) {
  const key = referenceKey(entry.ar, entry.en);
  const matches = nameReferences.get(key) || [];
  matches.push(entry);
  nameReferences.set(key, matches);
}

function referenceName(obj, translations, code) {
  // A separately edited JSON source label invalidates the seeded-name match,
  // even if the legacy columns still contain their original values.
  if (hasText(translations?.ar) && hasText(obj.name_ar) && translations.ar !== obj.name_ar) return '';
  if (hasText(translations?.en) && hasText(obj.name_en) && translations.en !== obj.name_en) return '';
  const ar = hasText(obj.name_ar) ? obj.name_ar : translations?.ar;
  const en = hasText(obj.name_en) ? obj.name_en : translations?.en;
  if (!hasText(ar) || !hasText(en)) return '';
  const matches = nameReferences.get(referenceKey(ar, en));
  const entry = matches?.find(row => !row.slug || !obj.slug || row.slug === obj.slug);
  return hasText(entry?.[code]) ? entry[code] : '';
}

// A translation in the requested language wins over another-language fallback,
// whether it lives in the JSON map or a legacy name_<language> column.
export function localizedName(obj, lang) {
  if (!obj || typeof obj !== 'object') return '';
  const code = languageCode(lang);
  let t = obj.name_translations;
  if (typeof t === 'string') {
    try { t = JSON.parse(t); } catch (_) { t = null; }
  }
  if (!t || typeof t !== 'object' || Array.isArray(t)) t = null;
  if (hasText(t?.[code])) return t[code];
  const key = `name_${code}`;
  if (hasText(obj[key])) return obj[key];
  // Seeded names have a native fallback only while their original Arabic and
  // English names still match. Admin edits and custom labels remain intact.
  const reference = referenceName(obj, t, code);
  if (reference) return reference;
  if (t) {
    if (hasText(t.en)) return t.en;
    if (hasText(t.ar)) return t.ar;
    const first = Object.values(t).find(hasText);
    if (first) return first;
  }
  if (hasText(obj.name_ar)) return obj.name_ar;
  if (hasText(obj.name_en)) return obj.name_en;
  if (hasText(obj.name)) return obj.name;
  return '';
}

// Resolve a catalog value shaped as { ar, en, ur, bn, hi }, accepting locale
// variants such as hi-IN. Preserve plain strings, including user-written text.
export function tx(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  return [value[languageCode(lang)], value.ar, value.en].find(hasText) || '';
}

const platformLabels = new Map(referenceNames.plans.flatMap(entry => [[entry.ar, entry], [entry.en, entry]]));

// Translate only the platform's known subscription labels. Provider-written
// descriptions and arbitrary feature text are preserved verbatim.
export function localizedPlatformText(value, lang) {
  if (value && typeof value === 'object') return tx(value, lang);
  if (typeof value !== 'string') return '';
  const entry = platformLabels.get(value);
  const translated = entry?.[languageCode(lang)];
  return hasText(translated) ? translated : value;
}
