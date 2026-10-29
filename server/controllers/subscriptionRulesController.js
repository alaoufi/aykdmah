const { query, queryOne } = require('../config/database');
const Setting = require('../models/Setting');
const { success, created, error, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Admin: where monthly subscriptions apply (AYK-042). See services/subscriptionRules.js.
const optionalId = value => (value === undefined || value === null || value === '' ? null
  : (/^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : NaN));

const list = asyncHandler(async (req, res) => {
  const rules = await query(`SELECT r.id, r.region_id, r.city_id, r.category_id, r.is_free, r.is_active, r.note, r.created_at,
      rg.name_ar AS region_name_ar, rg.name_en AS region_name_en, c.name_ar AS city_name_ar, c.name_en AS city_name_en,
      cat.name_ar AS category_name_ar, cat.name_en AS category_name_en, cat.name_translations AS category_name_translations
    FROM subscription_rules r
    LEFT JOIN regions rg ON rg.id = r.region_id LEFT JOIN cities c ON c.id = r.city_id LEFT JOIN categories cat ON cat.id = r.category_id
    ORDER BY r.is_free DESC, r.id DESC`);
  return success(res, { enabled: await require('../services/subscriptionRules').enabled(), rules });
});

const setEnabled = asyncHandler(async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return error(res, req.t('invalid_data'), 400);
  await Setting.set('subscriptions_enabled', req.body.enabled ? '1' : '0', 'string', 'subscriptions', 0, 'Monthly provider subscriptions by area and profession (AYK-042)');
  return success(res, { enabled: req.body.enabled }, req.t('updated'));
});

const create = asyncHandler(async (req, res) => {
  const regionId = optionalId(req.body?.region_id), cityId = optionalId(req.body?.city_id), categoryId = optionalId(req.body?.category_id);
  const note = req.body?.note == null ? null : String(req.body.note).slice(0, 255);
  if ([regionId, cityId, categoryId].some(Number.isNaN) || ![true, false, 0, 1].includes(req.body?.is_free ?? false)) return error(res, req.t('invalid_data'), 400);
  if (regionId && !await queryOne('SELECT id FROM regions WHERE id = ?', [regionId])) return error(res, req.t('invalid_data'), 400);
  if (cityId && !await queryOne('SELECT id FROM cities WHERE id = ?', [cityId])) return error(res, req.t('invalid_data'), 400);
  if (categoryId && !await queryOne('SELECT id FROM categories WHERE id = ?', [categoryId])) return error(res, req.t('invalid_data'), 400);
  const row = await queryOne(`INSERT INTO subscription_rules (region_id, city_id, category_id, is_free, note)
    VALUES (?, ?, ?, ?, ?) RETURNING id`, [regionId, cityId, categoryId, req.body?.is_free ? 1 : 0, note]);
  return created(res, { id: row.id }, req.t('updated'));
});

const update = asyncHandler(async (req, res) => {
  const id = optionalId(req.params.id);
  if (!id || typeof req.body?.is_active !== 'boolean') return error(res, req.t('invalid_data'), 400);
  const result = await query('UPDATE subscription_rules SET is_active = ? WHERE id = ?', [req.body.is_active ? 1 : 0, id]);
  if (!result.affectedRows) return notFound(res);
  return success(res, null, req.t('updated'));
});

const remove = asyncHandler(async (req, res) => {
  const id = optionalId(req.params.id);
  if (!id) return error(res, req.t('invalid_data'), 400);
  await query('DELETE FROM subscription_rules WHERE id = ?', [id]);
  return success(res, null, req.t('deleted'));
});

module.exports = { list, setEnabled, create, update, remove };
