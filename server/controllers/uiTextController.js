// Interface texts edited from the admin area (AYK-210). The built-in texts live in the client's
// locale files; a row in ui_text_overrides replaces one of them for one language, and deleting the
// row restores it. The public list is cached briefly so every page load does not hit the database.
const { query, queryOne } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

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

const saveText = asyncHandler(async (req, res) => {
  const { lang, key, value } = req.body || {};
  if (!validLang(lang) || !validKey(key) || typeof value !== 'string' || !value.trim() || value.length > MAX_VALUE) {
    return error(res, req.t('invalid_data'), 400);
  }
  await query(
    `INSERT INTO ui_text_overrides (lang, text_key, text_value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (lang, text_key) DO UPDATE SET text_value = EXCLUDED.text_value,
       updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [lang, key, value, req.user.id]
  );
  cache.delete(lang);
  await logChange(req, 'ui_text_update', lang, key);
  const row = await queryOne('SELECT lang, text_key, text_value, updated_at FROM ui_text_overrides WHERE lang = ? AND text_key = ?', [lang, key]);
  return success(res, row, req.t('settings_updated'));
});

const resetText = asyncHandler(async (req, res) => {
  const { lang, key } = req.body || {};
  if (!validLang(lang) || !validKey(key)) return error(res, req.t('invalid_data'), 400);
  await query('DELETE FROM ui_text_overrides WHERE lang = ? AND text_key = ?', [lang, key]);
  cache.delete(lang);
  await logChange(req, 'ui_text_reset', lang, key);
  return success(res, { lang, text_key: key }, req.t('settings_updated'));
});

module.exports = { publicTexts, listTexts, saveText, resetText, LANGS };
