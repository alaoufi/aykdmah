const { query, queryOne } = require('../config/database');
const { success, error, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { availability } = require('../utils/providerAvailability');

// "My directory" (AYK-041): providers a requester keeps to contact again without
// posting a request. Contacting one opens a direct request (requestController.direct).
const providerId = value => (/^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : null);

const list = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT u.id, u.full_name, u.avatar, u.is_verified, pp.business_name, pp.category_id,
      pp.rating_avg, pp.rating_count, pp.completed_orders,
      cat.name_ar AS category_name, cat.name_en AS category_name_en, cat.name_translations AS category_name_translations,
      dist.name_ar AS district_name_ar, dist.name_en AS district_name_en,
      to_jsonb(pp)->>'availability_status' AS availability_status, to_jsonb(pp)->>'vacation_from' AS vacation_from,
      to_jsonb(pp)->>'vacation_to' AS vacation_to, to_jsonb(pp)->>'work_days' AS work_days,
      to_jsonb(pp)->>'work_from' AS work_from, to_jsonb(pp)->>'work_to' AS work_to
    FROM saved_providers sp
    JOIN users u ON u.id = sp.provider_id AND u.role = 'provider' AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
    JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN categories cat ON cat.id = pp.category_id
    LEFT JOIN districts dist ON dist.id = u.district_id
    WHERE sp.user_id = ? ORDER BY sp.created_at DESC`, [req.user.id]);
  return success(res, rows.map(row => ({
    id: row.id, full_name: row.full_name, business_name: row.business_name, avatar: row.avatar,
    is_verified: Number(row.is_verified) === 1, category_id: row.category_id,
    category_name: row.category_name, category_name_en: row.category_name_en, category_name_translations: row.category_name_translations,
    district_name_ar: row.district_name_ar, district_name_en: row.district_name_en,
    rating_avg: Number(row.rating_avg) || 0, rating_count: Number(row.rating_count) || 0,
    completed_orders: Number(row.completed_orders) || 0, availability: availability(row),
  })));
});

const add = asyncHandler(async (req, res) => {
  const id = providerId(req.params.providerId);
  if (!id || id === req.user.id) return error(res, req.t('invalid_data'), 400);
  const provider = await queryOne("SELECT id FROM users WHERE id = ? AND role = 'provider' AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0", [id]);
  if (!provider) return notFound(res);
  await query('INSERT INTO saved_providers (user_id, provider_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [req.user.id, id]);
  return success(res, { saved: true }, req.t('directory_added'));
});

const remove = asyncHandler(async (req, res) => {
  const id = providerId(req.params.providerId);
  if (!id) return error(res, req.t('invalid_data'), 400);
  await query('DELETE FROM saved_providers WHERE user_id = ? AND provider_id = ?', [req.user.id, id]);
  return success(res, { saved: false }, req.t('directory_removed'));
});

const ids = asyncHandler(async (req, res) => {
  const rows = await query('SELECT provider_id FROM saved_providers WHERE user_id = ?', [req.user.id]);
  return success(res, rows.map(row => Number(row.provider_id)));
});

module.exports = { list, add, remove, ids };
