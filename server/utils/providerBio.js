// AYK-377: the provider's description of their services («وصف خدماتي»), in the reader's language.
// Lists carry at most BIO_LIST_MAX characters (the provider's page shows all of it).
const BIO_MAX = 10000; // the form allows 2000; older, longer texts still save
const BIO_LIST_MAX = 600;
const BIO_SQL = `LEFT(pp.bio, ${BIO_LIST_MAX + 1}) AS bio, pp.bio_translations`;

const parse = value => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch (_) { return {}; } }
  return {};
};
const cut = (text, max) => (typeof text === 'string' && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const lang = req => String(req?.lang || 'ar').toLowerCase().split(/[-_]/)[0];

// { bio, bio_translated? } for one row: the original, and the reader's language when it differs.
function bioFor(row, reader, max = BIO_LIST_MAX) {
  const original = typeof row?.bio === 'string' && row.bio.trim() ? row.bio.trim() : null;
  if (!original) return { bio: null };
  // Translations belong to the text they were made from (kept in the map under its own language).
  // Right after an edit the old ones are still there until the new ones are ready: never shown.
  const map = parse(row.bio_translations);
  // A list carries the text cut at BIO_LIST_MAX + 1 characters: there the start must match.
  const cutText = row.bio.length > BIO_LIST_MAX;
  const current = Object.values(map).some(value => typeof value === 'string' && (cutText ? value.startsWith(row.bio) : value === row.bio));
  const translated = current ? map[reader] : null;
  const out = { bio: cut(original, max) };
  if (typeof translated === 'string' && translated.trim() && translated.trim() !== original) out.bio_translated = cut(translated.trim(), max);
  return out;
}

module.exports = { BIO_MAX, BIO_LIST_MAX, BIO_SQL, bioFor, readerOf: lang };
