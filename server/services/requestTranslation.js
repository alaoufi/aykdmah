// A request's title and details in the reader's language (AYK-229, AYK-231). Translated as soon
// as the request is posted into the languages the providers use, saved once per language, and
// sent with the request lists and pages themselves, so a provider sees it in their language at
// once. A failed translation is not saved and is tried again on the next view.
const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const translationService = require('./translationService');

const { SUPPORTED, detectLanguageFallback } = translationService;
const UNIQUE_SCRIPT = new Set(['ar', 'ur', 'bn', 'ml', 'am']);
const pending = new Map();

const texts = request => {
  const title = String(request?.title || '');
  const description = String(request?.description || '');
  return { title, description, sameText: description.trim() === title.trim() };
};

// The original as is: { translated: false }. Otherwise { translated: true, title, description }.
function translationFor(request, lang) {
  const key = `${request.id}:${lang}`;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    const { title, description, sameText } = texts(request);
    const script = await detectLanguageFallback(`${title} ${sameText ? '' : description}`);
    const original = { language: script, source_lang: script, title, description, translated: false };
    // Only a script that one language alone uses proves the text is in the reader's language;
    // Latin letters and Devanagari are left to the translator to detect.
    if (script === lang && UNIQUE_SCRIPT.has(lang)) return original;
    const saved = await queryOne('SELECT source_lang, title, description FROM request_translations WHERE request_id = ? AND lang = ?', [request.id, lang]);
    if (saved) return { language: lang, source_lang: saved.source_lang, title: saved.title, description: saved.description ?? saved.title, translated: true, cached: true };
    try {
      const [t1, t2] = await Promise.all([
        title ? translationService.translate(title, null, lang) : null,
        sameText || !description ? null : translationService.translate(description, null, lang),
      ]);
      const translatedTitle = t1 && t1.provider !== 'noop' && t1.text ? t1.text : null;
      const translatedDescription = sameText ? translatedTitle : (t2 && t2.provider !== 'noop' && t2.text ? t2.text : null);
      if (!translatedTitle && !translatedDescription) return { ...original, same: true };
      const row = { title: translatedTitle || title, description: translatedDescription || description };
      const source = t1?.from || t2?.from || script;
      await query(`INSERT INTO request_translations (request_id, lang, source_lang, title, description, provider)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (request_id, lang) DO NOTHING`,
      [request.id, lang, source, row.title, row.description, String(t1?.provider || t2?.provider || '').slice(0, 30)]).catch(() => {});
      return { language: lang, source_lang: source, ...row, translated: true };
    } catch (_) {
      return { ...original, error: 'translation_unavailable' };
    }
  })().finally(() => setTimeout(() => pending.delete(key), 1000).unref?.());
  pending.set(key, work);
  if (pending.size > 5000) pending.delete(pending.keys().next().value);
  return work;
}

// The saved translations of a list of requests in one language: request.translation.
async function attachTranslations(requests, lang) {
  if (!SUPPORTED.includes(lang) || !requests?.length) return requests;
  const ids = requests.map(r => Number(r.id)).filter(Number.isSafeInteger);
  if (!ids.length) return requests;
  const rows = await query(`SELECT request_id, source_lang, title, description FROM request_translations
    WHERE lang = ? AND request_id IN (${ids.map(() => '?').join(',')})`, [lang, ...ids]).catch(() => []);
  const byId = new Map(rows.map(row => [Number(row.request_id), row]));
  for (const request of requests) {
    const row = byId.get(Number(request.id));
    if (row) request.translation = { lang, title: row.title, description: row.description ?? row.title, source_lang: row.source_lang || null };
  }
  return requests;
}

// Right after posting: into every language the providers use (other than the request's own).
async function translateForProviders(request) {
  if (!request?.id) return;
  const { title, description, sameText } = texts(request);
  const script = await detectLanguageFallback(`${title} ${sameText ? '' : description}`);
  const rows = await query(`SELECT DISTINCT ui_lang FROM users WHERE role IN ('provider', 'admin') AND ui_lang IS NOT NULL
    AND deleted_at IS NULL`).catch(() => []);
  const langs = rows.map(row => row.ui_lang).filter(lang => SUPPORTED.includes(lang) && !(lang === script && UNIQUE_SCRIPT.has(lang)));
  for (const lang of langs) await translationFor(request, lang).catch(err => logger.warn('Request translation failed:', err.message));
}

module.exports = { translationFor, attachTranslations, translateForProviders };
