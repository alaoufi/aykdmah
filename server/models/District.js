const { normalizeCatalog, catalogId } = require('../utils/catalogValidation');
const { query, queryOne } = require('../config/database');

async function findAll({ cityId, activeOnly = true } = {}) {
  const where = [];
  const params = [];
  if (cityId) { where.push('city_id = ?'); params.push(cityId); }
  if (activeOnly) where.push('is_active = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT id, city_id, name_ar, name_en, latitude, longitude, is_active
     FROM districts ${whereSql} ORDER BY name_ar ASC`,
    params
  );
}

async function findById(id) {
  return queryOne('SELECT * FROM districts WHERE id = ?', [id]);
}

async function create(data) {
  const { city_id, name_ar, name_en, latitude, longitude, is_active = 1 } = normalizeCatalog('district', data, { create: true });
  const result = await query(
    `INSERT INTO districts (city_id, name_ar, name_en, latitude, longitude, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [city_id, name_ar, name_en || null, latitude ?? null, longitude ?? null, is_active]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('district', data);
  const allowed = ['city_id', 'name_ar', 'name_en', 'latitude', 'longitude', 'is_active'];
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
  await query(`UPDATE districts SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await query('DELETE FROM districts WHERE id = ?', [id]);
}

module.exports = { findAll, findById, create, update, remove };
