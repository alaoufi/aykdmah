import { localizedName } from './localize.js';

// Joined API fields keep their original label for compatibility while also
// exposing the names needed to follow a language change without another fetch.
export function localizedJoinedName(row, prefix, lang) {
  if (!row) return '';
  return localizedName({
    name: row[`${prefix}_name`],
    name_ar: row[`${prefix}_name_ar`] || row[`${prefix}_name`],
    name_en: row[`${prefix}_name_en`],
    name_translations: row[`${prefix}_name_translations`],
  }, lang);
}
