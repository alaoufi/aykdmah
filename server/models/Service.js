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

async function findAll({ categoryId, activeOnly = true } = {}) {
  const where = ['s.deleted_at IS NULL'];
  const params = [];
  if (categoryId) { where.push('s.category_id = ?'); params.push(categoryId); }
  if (activeOnly) where.push('s.is_active = 1');
  const rows = await query(
    `SELECT s.*, c.name_ar AS category_name, c.name_en AS category_name_en,
            c.name_translations AS category_name_translations, c.slug AS category_slug
     FROM services s
     LEFT JOIN categories c ON s.category_id = c.id
     WHERE ${where.join(' AND ')}
     ORDER BY s.sort_order ASC, s.name_ar ASC`,
    params
  );
  return rows.map(parseRow);
}

async function findById(id) {
  return parseRow(await queryOne(
    `SELECT s.*, c.name_ar AS category_name, c.name_en AS category_name_en,
            c.name_translations AS category_name_translations, c.slug AS category_slug
     FROM services s LEFT JOIN categories c ON s.category_id = c.id
     WHERE s.id = ? AND s.deleted_at IS NULL`,
    [id]
  ));
}

async function findBySlug(slug) {
  return parseRow(await queryOne(
    `SELECT s.*, c.name_ar AS category_name, c.name_en AS category_name_en,
            c.name_translations AS category_name_translations FROM services s
     LEFT JOIN categories c ON s.category_id = c.id
     WHERE s.slug = ? AND s.deleted_at IS NULL`,
    [slug]
  ));
}

async function slugExists(slug, ignoreId = null) {
  const row = await queryOne(
    `SELECT id FROM services WHERE slug = ? ${ignoreId ? 'AND id <> ?' : ''} LIMIT 1`,
    ignoreId ? [slug, ignoreId] : [slug]
  );
  return !!row;
}

async function create(data) {
  const { category_id, name_ar, name_en, slug, description, icon, base_price,
                        is_urgent_supported, sort_order,
                        name_translations, description_translations, is_active = 1 } = normalizeCatalog('service', data, { create: true });
  const result = await query(
    `INSERT INTO services
      (category_id, name_ar, name_en, slug, description, icon, base_price,
       is_urgent_supported, sort_order, is_active, name_translations, description_translations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category_id, name_ar, name_en || null, slug, description || null,
      icon || null, base_price ?? null,
      is_urgent_supported ? 1 : 0, sort_order ?? 0, is_active,
      name_translations ? JSON.stringify(name_translations) : null,
      description_translations ? JSON.stringify(description_translations) : null,
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  id = catalogId(id);
  data = normalizeCatalog('service', data);
  const allowed = ['category_id', 'name_ar', 'name_en', 'slug', 'description', 'icon', 'base_price', 'is_active', 'is_urgent_supported', 'sort_order'];
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
  await query(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function softDelete(id) {
  await query('UPDATE services SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

module.exports = { findAll, findById, findBySlug, slugExists, create, update, softDelete };
