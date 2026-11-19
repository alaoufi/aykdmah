const { normalizeCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const { query, queryOne, tableHasColumn } = require('../config/database');

async function findAll({ activeOnly = true, countryId } = {}) {
  // countryId support is conditional on migration 023 having run.
  const hasCountry = await tableHasColumn('regions', 'country_id');
  const wheres = [];
  const params = [];
  if (activeOnly) wheres.push('is_active = 1');
  if (countryId && hasCountry) { wheres.push('country_id = ?'); params.push(Number(countryId)); }
  const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const extra = hasCountry ? ', country_id' : '';
  return query(
    `SELECT id, code, name_ar, name_en, capital_ar, capital_en,
            latitude, longitude, is_active, sort_order${extra}
     FROM regions ${whereSql}
     ORDER BY sort_order ASC, name_ar ASC`,
    params
  );
}

async function findById(id) {
  return queryOne('SELECT * FROM regions WHERE id = ?', [id]);
}

async function create(data) {
  const { code, name_ar, name_en, capital_ar, capital_en,
                        latitude, longitude, sort_order, country_id, is_active = 1 } = normalizeCatalog('region', data, { create: true });
  const hasCountry = await tableHasColumn('regions', 'country_id');
  const cols = ['code', 'name_ar', 'name_en', 'capital_ar', 'capital_en',
                'latitude', 'longitude', 'sort_order', 'is_active'];
  const vals = [code || null, name_ar, name_en || null, capital_ar || null, capital_en || null,
                latitude ?? null, longitude ?? null, sort_order ?? 0, is_active];
  if (hasCountry) { cols.push('country_id'); vals.push(country_id || null); }
  const placeholders = cols.map(() => '?').join(', ');
  const result = await query(`INSERT INTO regions (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('region', data);
  const hasCountry = await tableHasColumn('regions', 'country_id');
  const allowed = ['code', 'name_ar', 'name_en', 'capital_ar', 'capital_en',
                   'latitude', 'longitude', 'is_active', 'sort_order'];
  if (hasCountry) allowed.push('country_id');
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await query(`UPDATE regions SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await query('DELETE FROM regions WHERE id = ?', [id]);
}

// Bulk reorder: sort_order = position in `ids` array. Single round-trip
// via CASE so the dragged list lands in the requested order even with
// large pages.
async function reorder(ids) {
  ids = reorderIds({ ids });
  if (ids.length === 0) return;
  const cases = ids.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
  const placeholders = ids.map(() => '?').join(',');
  await query(
    `UPDATE regions SET sort_order = CASE id ${cases} ELSE sort_order END
     WHERE id IN (${placeholders})`,
    ids
  );
}

module.exports = { findAll, findById, create, update, remove, reorder };
