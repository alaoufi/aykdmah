const { normalizeCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const { query, queryOne } = require('../config/database');

// Compatibility for callers from older versions. Geography is initialized by
// the tracked CLI migrations, so a public read must never alter schema or data.
async function ensureSeed() {}

function parseRow(row) {
  if (!row) return null;
  if (row.languages_enabled && typeof row.languages_enabled === 'string') {
    try { row.languages_enabled = JSON.parse(row.languages_enabled); }
    catch (_) { row.languages_enabled = null; }
  }
  return row;
}

async function listAll({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  const rows = await query(
    `SELECT * FROM countries ${where} ORDER BY sort_order ASC, name_ar ASC`
  );
  return rows.map(parseRow);
}

async function findById(id) {
  return parseRow(await queryOne('SELECT * FROM countries WHERE id = ?', [id]));
}

async function findByCode(code) {
  return parseRow(await queryOne('SELECT * FROM countries WHERE code = ?', [String(code).toUpperCase()]));
}

async function create(data) {
  data = normalizeCatalog('country', data, { create: true });
  const result = await query(
    `INSERT INTO countries
       (code, name_ar, name_en, flag_emoji, dial_code, currency_code, currency_symbol,
        languages_enabled, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(data.code).toUpperCase(),
      data.name_ar, data.name_en,
      data.flag_emoji || null,
      data.dial_code || null,
      data.currency_code,
      data.currency_symbol || null,
      data.languages_enabled ? JSON.stringify(data.languages_enabled) : null,
      data.is_active ?? 1,
      data.sort_order ?? 99,
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('country', data);
  const allowed = ['code', 'name_ar', 'name_en', 'flag_emoji', 'dial_code',
                   'currency_code', 'currency_symbol', 'is_active', 'sort_order'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(k === 'code' ? String(data[k]).toUpperCase() : data[k]);
    }
  }
  if (data.languages_enabled !== undefined) {
    fields.push('languages_enabled = ?');
    values.push(data.languages_enabled ? JSON.stringify(data.languages_enabled) : null);
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await query(`UPDATE countries SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await query('DELETE FROM countries WHERE id = ?', [id]);
}

async function reorder(ids) {
  ids = reorderIds({ ids });
  if (ids.length === 0) return;
  const cases = ids.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
  const placeholders = ids.map(() => '?').join(',');
  await query(
    `UPDATE countries SET sort_order = CASE id ${cases} ELSE sort_order END
     WHERE id IN (${placeholders})`,
    ids
  );
}

module.exports = { listAll, findById, findByCode, create, update, remove, reorder, ensureSeed };
