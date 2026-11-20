// AYK-343 (the owner: «أي إضافة في أي مكان مثل إضافة قسم أو رسائل تُترجم مباشرة لكل اللغات»).
//
// 1. Names the administration adds (professions, services, places, subscription plans, ads) are
//    translated into the 11 languages as soon as they are saved, and kept with the row. A language
//    whose translation failed is left out, never filled with the original, and a sweep tries it
//    again later (every few hours) until all 11 are there.
// 2. Messages (support, disputes, messages from the administration about an ad) are shown to each
//    reader in the reader's language, with the original one tap away. The translation memory keeps
//    each sentence once, so reading again costs nothing.
const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const translationService = require('./translationService');

const LANGS = ['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];
const code = lang => {
  const base = String(lang || '').toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(base) ? base : 'ar';
};
const hasText = value => typeof value === 'string' && value.trim() !== '';
const parse = value => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') { try { const v = JSON.parse(value); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } }
  return {};
};

// One text in one language: the translation, or null when it failed or there was nothing to do.
async function one(text, from, to) {
  if (!hasText(text) || from === to) return null;
  try {
    const result = await translationService.translate(text, from, to);
    const out = result?.text;
    if (!hasText(out) || result.provider === 'noop') return null;
    // A translator that answers with the very same text did not translate it.
    if (out.trim() === String(text).trim()) return null;
    return out;
  } catch (_) { return null; }
}

// The languages still missing from a translations map, filled from its source text.
// Returns the new map (only languages that worked are added) and whether anything changed.
async function fill(existing, text, source = 'ar') {
  const map = parse(existing);
  const from = code(source);
  if (!hasText(text)) return { map, changed: false };
  let changed = false;
  if (map[from] !== text) { map[from] = text; changed = true; }
  const missing = LANGS.filter(lang => lang !== from && !hasText(map[lang]));
  const results = await Promise.all(missing.map(lang => one(text, from, lang)));
  missing.forEach((lang, i) => { if (results[i]) { map[lang] = results[i]; changed = true; } });
  return { map, changed };
}
const complete = map => LANGS.every(lang => hasText(parse(map)[lang]));

// The tables and fields kept translated: [column holding the source text, column of translations].
const TABLES = {
  categories: [['name_ar', 'name_translations'], ['description', 'description_translations']],
  services: [['name_ar', 'name_translations'], ['description', 'description_translations']],
  countries: [['name_ar', 'name_translations']],
  regions: [['name_ar', 'name_translations']],
  governorates: [['name_ar', 'name_translations']],
  cities: [['name_ar', 'name_translations']],
  districts: [['name_ar', 'name_translations']],
  subscription_plans: [['name_ar', 'name_translations'], ['description', 'description_translations']],
  ads: [['title', 'title_translations'], ['description', 'description_translations']],
  // AYK-377: the provider's description of their services, written in any language.
  provider_profiles: [['bio', 'bio_translations']],
};

const SOURCE_DETECTED = new Set(['ads', 'provider_profiles']);
const pending = new Map();
// Translates one saved row into every language. Safe to call without waiting (never throws).
function translateRow(table, id) {
  const fields = TABLES[table];
  if (!fields || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return Promise.resolve(false);
  const key = `${table}:${id}`;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    const cols = fields.flat().join(', ');
    let row;
    try { row = await queryOne(`SELECT ${cols} FROM ${table} WHERE id = ?`, [Number(id)]); } catch (_) { return false; }
    if (!row) return false;
    const sets = [], values = [];
    for (const [source, target] of fields) {
      if (!(source in row)) continue;
      const before = parse(row[target]);
      // The source text changed: its old translations no longer say the same thing.
      const stale = Object.keys(before).length > 0 && hasText(row[source]) && !Object.values(before).includes(row[source]);
      // Names are entered in Arabic; an ad is written by its advertiser in any language.
      const from = SOURCE_DETECTED.has(table) ? await translationService.detectLanguageFallback(row[source]) : 'ar';
      const { map, changed } = await fill(stale ? {} : before, row[source], from);
      if (changed || stale) { sets.push(`${target} = ?`); values.push(JSON.stringify(map)); }
    }
    if (!sets.length) return true;
    try { await query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, [...values, Number(id)]); } catch (err) {
      logger.warn(`Saving translations of ${table} ${id} failed: ${err.message}`);
      return false;
    }
    return true;
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
const later = (table, id) => { translateRow(table, id).catch(() => {}); };

// Rows whose translations are started but not complete, a few at a time (the translators' free
// allowances are limited). Rows never started (NULL) are the places seeded with the site, named
// by the site's own reference list; they are left alone.
async function sweep({ limit = 60 } = {}) {
  let done = 0;
  for (const [table, fields] of Object.entries(TABLES)) {
    for (const [source, target] of fields) {
      if (done >= limit) return done;
      let rows = [];
      try {
        rows = await query(`SELECT id, ${source} AS source, ${target} AS tr FROM ${table} WHERE ${target} IS NOT NULL ORDER BY id DESC LIMIT 500`);
      } catch (_) { continue; }
      for (const row of rows) {
        if (done >= limit) return done;
        if (!hasText(row.source) || complete(row.tr)) continue;
        await translateRow(table, row.id);
        done += 1;
      }
    }
  }
  return done;
}

let timer = null;
function start() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const run = () => sweep().then(n => { if (n) logger.info(`Translated ${n} saved names into the other languages`); }).catch(() => {});
  setTimeout(run, 2 * 60 * 1000).unref();
  timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
}

// A message for one reader: { text, original } when it was translated, else { text }.
async function forReader(text, lang) {
  const to = code(lang);
  if (!hasText(text)) return { text };
  const out = await one(text, null, to);
  return out ? { text: out, original: text, translated: true } : { text };
}
// Adds `<field>_translated` (and keeps the original field) to each row, for this reader.
async function rowsForReader(rows, field, lang) {
  const list = Array.isArray(rows) ? rows : [];
  await Promise.all(list.map(async row => {
    const result = await forReader(row?.[field], lang);
    if (result.translated) row[`${field}_translated`] = result.text;
  }));
  return list;
}
// Translated now so the reader finds it ready (the memory keeps it); never waits, never throws.
function prepare(text, lang) { if (hasText(text)) one(text, null, code(lang)).catch(() => {}); }
// The reader's language as the site knows it: the account's chosen language, else the request's.
async function readerLang(userId, fallback) {
  if (userId) {
    try { const row = await queryOne('SELECT ui_lang FROM users WHERE id = ?', [userId]); if (row?.ui_lang) return code(row.ui_lang); } catch (_) { /* fallback */ }
  }
  return code(fallback);
}

module.exports = { LANGS, TABLES, fill, translateRow, later, sweep, start, forReader, rowsForReader, prepare, readerLang, complete };
