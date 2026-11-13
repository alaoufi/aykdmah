// Interface texts edited from the admin area (AYK-210). The built-in texts live in the client's
// locale files; a row in ui_text_overrides replaces one of them for one language, and deleting the
// row restores it. The public list is cached briefly so every page load does not hit the database.
const { query, queryOne } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const translationService = require('../services/translationService');

const LANGS = ['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];
const KEY_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){1,6}$/;
const MAX_VALUE = 5000;
const CACHE_MS = 30 * 1000;
const cache = new Map();

const validLang = lang => typeof lang === 'string' && LANGS.includes(lang);
const validKey = key => typeof key === 'string' && key.length <= 200 && KEY_RE.test(key);

async function overridesFor(lang) {
  const hit = cache.get(lang);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const rows = await query('SELECT text_key, text_value FROM ui_text_overrides WHERE lang = ?', [lang]);
  const data = {};
  for (const row of rows) data[row.text_key] = row.text_value;
  cache.set(lang, { at: Date.now(), data });
  return data;
}

// Public: { "requester.directory_empty": "…" } for one language.
const publicTexts = asyncHandler(async (req, res) => {
  if (!validLang(req.params.lang)) return error(res, req.t('invalid_data'), 400);
  res.set('Cache-Control', 'no-cache');
  return success(res, await overridesFor(req.params.lang));
});

const listTexts = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT o.lang, o.text_key, o.text_value, o.updated_at, u.full_name AS updated_by_name
     FROM ui_text_overrides o LEFT JOIN users u ON u.id = o.updated_by
     ORDER BY o.lang, o.text_key`
  );
  return success(res, rows);
});

async function logChange(req, action, lang, key) {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, description, ip_address, user_agent)
       VALUES (?, ?, 'ui_text', ?, ?, ?)`,
      [req.user.id, action, `${lang}:${key}`.slice(0, 250), req.ip || null, String(req.get('user-agent') || '').slice(0, 250) || null]
    );
  } catch (_) { /* the log never blocks the change */ }
}

// The parts the code fills in or styles ({{name}}, <1>…</1>) must survive a machine translation
// unchanged: they are swapped for numbered markers first, and a translation that loses or changes
// one is not saved (AYK-213).
const PLACEHOLDER = /\{\{\s*[\w.-]+\s*\}\}|<\/?\d+\s*\/?>/g;
const placeholders = text => (String(text).match(PLACEHOLDER) || []).map(part => part.replace(/\s+/g, '')).sort();
const samePlaceholders = (a, b) => JSON.stringify(placeholders(a)) === JSON.stringify(placeholders(b));

async function translateText(value, from, to) {
  const parts = [];
  const masked = value.replace(PLACEHOLDER, part => { parts.push(part); return ` §${parts.length - 1}§ `; });
  const result = await translationService.translate(masked, from, to);
  let text = String(result?.text || '');
  if (!text.trim() || result?.provider === 'noop') return null;
  for (let i = 0; i < parts.length; i += 1) {
    const marker = new RegExp(`\\s*§\\s*${i}\\s*§\\s*`);
    if (!marker.test(text)) return null;
    text = text.replace(marker, ` ${parts[i]} `);
  }
  text = text.replace(/\s{2,}/g, ' ').trim();
  return text && !/§/.test(text) && samePlaceholders(value, text) && text.length <= MAX_VALUE ? text : null;
}

async function upsert(lang, key, value, userId) {
  await query(
    `INSERT INTO ui_text_overrides (lang, text_key, text_value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (lang, text_key) DO UPDATE SET text_value = EXCLUDED.text_value,
       updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [lang, key, value, userId]
  );
  cache.delete(lang);
}

// Saves one text. With translate_all, the text is also machine-translated into every other
// language and saved there; a language whose translation fails keeps its current text (AYK-213).
const saveText = asyncHandler(async (req, res) => {
  const { lang, key, value, translate_all: translateAll } = req.body || {};
  if (!validLang(lang) || !validKey(key) || typeof value !== 'string' || !value.trim() || value.length > MAX_VALUE
    || (translateAll !== undefined && typeof translateAll !== 'boolean')) {
    return error(res, req.t('invalid_data'), 400);
  }
  await upsert(lang, key, value, req.user.id);
  await logChange(req, 'ui_text_update', lang, key);
  const translations = {};
  const skipped = [];
  if (translateAll) {
    const targets = LANGS.filter(code => code !== lang);
    const results = await Promise.allSettled(targets.map(code => translateText(value, lang, code)));
    for (let i = 0; i < targets.length; i += 1) {
      const text = results[i].status === 'fulfilled' ? results[i].value : null;
      if (!text) { skipped.push(targets[i]); continue; }
      await upsert(targets[i], key, text, req.user.id);
      translations[targets[i]] = text;
    }
    if (Object.keys(translations).length) await logChange(req, 'ui_text_translate', Object.keys(translations).join(','), key);
  }
  const row = await queryOne('SELECT lang, text_key, text_value, updated_at FROM ui_text_overrides WHERE lang = ? AND text_key = ?', [lang, key]);
  return success(res, { ...row, translations, skipped }, req.t('settings_updated'));
});

// Restores the built-in text; with all_languages, in every language at once (AYK-213).
const resetText = asyncHandler(async (req, res) => {
  const { lang, key, all_languages: allLanguages } = req.body || {};
  if (!validLang(lang) || !validKey(key) || (allLanguages !== undefined && typeof allLanguages !== 'boolean')) return error(res, req.t('invalid_data'), 400);
  if (allLanguages) {
    await query('DELETE FROM ui_text_overrides WHERE text_key = ?', [key]);
    LANGS.forEach(code => cache.delete(code));
  } else {
    await query('DELETE FROM ui_text_overrides WHERE lang = ? AND text_key = ?', [lang, key]);
    cache.delete(lang);
  }
  await logChange(req, 'ui_text_reset', allLanguages ? 'all' : lang, key);
  return success(res, { lang, text_key: key, all_languages: Boolean(allLanguages) }, req.t('settings_updated'));
});

module.exports = { publicTexts, listTexts, saveText, resetText, LANGS };
