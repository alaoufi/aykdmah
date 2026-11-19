const { normalizeCatalog, catalogId } = require('../utils/catalogValidation');
const { query, queryOne } = require('../config/database');

async function findAll({ regionId, activeOnly = true } = {}) {
  const where = [];
  const params = [];
  if (regionId) { where.push('region_id = ?'); params.push(regionId); }
  if (activeOnly) where.push('is_active = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT id, region_id, name_ar, name_en, latitude, longitude,
            is_capital, is_active, sort_order
     FROM governorates ${whereSql}
     ORDER BY is_capital DESC, sort_order ASC, name_ar ASC`,
    params
  );
}

async function findById(id) {
  return queryOne('SELECT * FROM governorates WHERE id = ?', [id]);
}

async function create(data) {
  const { region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order, is_active = 1 } = normalizeCatalog('governorate', data, { create: true });
  const result = await query(
    `INSERT INTO governorates (region_id, name_ar, name_en, latitude, longitude, is_capital, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      region_id,
      name_ar,
      name_en || null,
      latitude ?? null,
      longitude ?? null,
      is_capital ? 1 : 0,
      sort_order ?? 0, is_active,
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('governorate', data);
  const allowed = ['region_id', 'name_ar', 'name_en', 'latitude', 'longitude',
                   'is_capital', 'is_active', 'sort_order'];
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
  await query(`UPDATE governorates SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await query('DELETE FROM governorates WHERE id = ?', [id]);
}

module.exports = { findAll, findById, create, update, remove };
