const { normalizeCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const { query, queryOne, tableHasColumn } = require('../config/database');

// Cities can attach to:
//   - a governorate (Saudi-style 4-tier hierarchy), OR
//   - a region directly (most other Arab states only have 3 tiers)
// When filtering by region we OR over both paths so either works.
async function findAll({ governorateId, regionId, activeOnly = true } = {}) {
  const hasCityRegion = await tableHasColumn('cities', 'region_id');
  const where = [];
  const params = [];
  if (governorateId) { where.push('c.governorate_id = ?'); params.push(governorateId); }
  if (regionId) {
    if (hasCityRegion) {
      where.push('(g.region_id = ? OR c.region_id = ?)');
      params.push(regionId, regionId);
    } else {
      where.push('g.region_id = ?');
      params.push(regionId);
    }
  }
  if (activeOnly) where.push('c.is_active = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const needsJoin = regionId !== undefined && regionId !== null && regionId !== '';
  const selectExtra = hasCityRegion ? ', c.region_id' : '';
  return query(
    `SELECT c.id, c.governorate_id, c.name_ar, c.name_en, c.latitude, c.longitude,
            c.is_active, c.sort_order${selectExtra}
     FROM cities c
     ${needsJoin ? 'LEFT JOIN governorates g ON g.id = c.governorate_id' : ''}
     ${whereSql}
     ORDER BY c.sort_order ASC, c.name_ar ASC`,
    params
  );
}

async function findById(id) {
  return queryOne('SELECT * FROM cities WHERE id = ?', [id]);
}

async function create(data) {
  const { governorate_id, region_id, name_ar, name_en,
                        latitude, longitude, sort_order, is_active = 1 } = normalizeCatalog('city', data, { create: true });
  const hasRegion = await tableHasColumn('cities', 'region_id');
  const cols = ['governorate_id', 'name_ar', 'name_en', 'latitude', 'longitude', 'sort_order', 'is_active'];
  const vals = [governorate_id || null, name_ar, name_en || null,
                latitude ?? null, longitude ?? null, sort_order ?? 0, is_active];
  if (hasRegion) { cols.push('region_id'); vals.push(region_id || null); }
  const placeholders = cols.map(() => '?').join(', ');
  const result = await query(`INSERT INTO cities (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('city', data);
  const hasRegion = await tableHasColumn('cities', 'region_id');
  const allowed = ['governorate_id', 'name_ar', 'name_en', 'latitude', 'longitude',
                   'is_active', 'sort_order'];
  if (hasRegion) allowed.push('region_id');
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
  await query(`UPDATE cities SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await query('DELETE FROM cities WHERE id = ?', [id]);
}

async function reorder(ids) {
  ids = reorderIds({ ids });
  if (ids.length === 0) return;
  const cases = ids.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
  const placeholders = ids.map(() => '?').join(',');
  await query(
    `UPDATE cities SET sort_order = CASE id ${cases} ELSE sort_order END
     WHERE id IN (${placeholders})`,
    ids
  );
}

module.exports = { findAll, findById, create, update, remove, reorder };
