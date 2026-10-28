// Pick the right field from an entity that carries multilingual data.
//
// Server writes name_translations = { ar, en, ur, bn, hi } on every
// category/service create/update. Components call:
//
//   const name = localizeName(category, i18n.resolvedLanguage);
//
// Falls back gracefully:
//   1. exact language match    (e.g. 'hi')
//   2. language without region (e.g. 'en-GB' → 'en')
//   3. English
//   4. Arabic
//   5. any first available value
//   6. legacy name_ar / name_en columns

import { FALLBACK_CHAIN } from '../i18n';

export function pickTranslation(translations, lang, legacy = {}) {
  if (translations && typeof translations === 'object') {
    const code = (lang || 'ar').toLowerCase().split(/[-_]/)[0];
    if (translations[code]) return translations[code];
    for (const fb of FALLBACK_CHAIN) {
      if (translations[fb]) return translations[fb];
    }
    const first = Object.values(translations).find((v) => v && String(v).trim());
    if (first) return first;
  }
  // Legacy back-compat
  const code = (lang || 'ar').toLowerCase().split(/[-_]/)[0];
  if (code === 'en' && legacy.name_en) return legacy.name_en;
  return legacy.name_ar || legacy.name_en || '';
}

export function localizeName(entity, lang) {
  if (!entity) return '';
  return pickTranslation(entity.name_translations, lang, entity);
}

export function localizeDescription(entity, lang) {
  if (!entity) return '';
  return pickTranslation(entity.description_translations, lang, { name_ar: entity.description });
}
