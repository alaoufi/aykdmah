const { normalizeCatalog, catalogId } = require('../utils/catalogValidation');
const { query, queryOne } = require('../config/database');

function parseRow(row) {
  if (!row) return row;
  if (typeof row.name_translations === 'string') {
    try { row.name_translations = JSON.parse(row.name_translations); } catch (_) { row.name_translations = null; }
  }
  if (typeof row.description_translations === 'string') {
    try { row.description_translations = JSON.parse(row.description_translations); } catch (_) { row.description_translations = null; }
  }
  return row;
}

async function findAll(activeOnly = true) {
  const where = ['c.deleted_at IS NULL'];
  if (activeOnly) where.push('c.is_active = 1');
  // LEFT JOIN counts active sub-services per category in one query —
  // avoids an N+1 from the client.
  const rows = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM services s
             WHERE s.category_id = c.id
               AND s.deleted_at IS NULL
               AND s.is_active = 1) AS services_count
     FROM categories c
     WHERE ${where.join(' AND ')}
     ORDER BY c.sort_order ASC, c.name_ar ASC`
  );
  return rows.map(parseRow);
}

async function findById(id) {
  return parseRow(await queryOne('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [id]));
}

async function findBySlug(slug) {
  return parseRow(await queryOne('SELECT * FROM categories WHERE slug = ? AND deleted_at IS NULL', [slug]));
}

// Internal helper: does a slug exist for a different row?
async function slugExists(slug, ignoreId = null) {
  const row = await queryOne(
    `SELECT id FROM categories WHERE slug = ? ${ignoreId ? 'AND id <> ?' : ''} LIMIT 1`,
    ignoreId ? [slug, ignoreId] : [slug]
  );
  return !!row;
}

async function create(data) {
  const { name_ar, name_en, slug, icon, color, description, sort_order,
                        name_translations, description_translations, is_active = 1 } = normalizeCatalog('category', data, { create: true });
  const result = await query(
    `INSERT INTO categories
      (name_ar, name_en, slug, icon, color, description, sort_order, is_active,
       name_translations, description_translations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name_ar, name_en || null, slug, icon || null, color || null,
      description || null, sort_order ?? 0, is_active,
      name_translations ? JSON.stringify(name_translations) : null,
      description_translations ? JSON.stringify(description_translations) : null,
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('category', data);
  const allowed = ['name_ar', 'name_en', 'slug', 'icon', 'color', 'description', 'is_active', 'sort_order'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k} = ?`); values.push(data[k]); }
  }
  if (data.name_translations !== undefined) {
    fields.push('name_translations = ?');
    values.push(data.name_translations ? JSON.stringify(data.name_translations) : null);
  }
  if (data.description_translations !== undefined) {
    fields.push('description_translations = ?');
    values.push(data.description_translations ? JSON.stringify(data.description_translations) : null);
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function softDelete(id) {
  await query('UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

module.exports = { findAll, findById, findBySlug, slugExists, create, update, softDelete };
