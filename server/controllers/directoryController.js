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
      , sp.nickname, u.referral_code, u.role,
      (SELECT c.id FROM conversations c
        JOIN conversation_participants mine ON mine.conversation_id = c.id AND mine.user_id = sp.user_id
        JOIN conversation_participants theirs ON theirs.conversation_id = c.id AND theirs.user_id = u.id
        ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC LIMIT 1) AS conversation_id
    FROM saved_providers sp
    JOIN users u ON u.id = sp.provider_id AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN categories cat ON cat.id = pp.category_id
    LEFT JOIN districts dist ON dist.id = u.district_id
    WHERE sp.user_id = ? ORDER BY sp.created_at DESC`, [req.user.id]);
  return success(res, rows.map(row => ({
    id: row.id, full_name: row.full_name, business_name: row.business_name, avatar: row.avatar,
    is_verified: Number(row.is_verified) === 1, category_id: row.category_id,
    category_name: row.category_name, category_name_en: row.category_name_en, category_name_translations: row.category_name_translations,
    district_name_ar: row.district_name_ar, district_name_en: row.district_name_en,
    rating_avg: Number(row.rating_avg) || 0, rating_count: Number(row.rating_count) || 0,
    completed_orders: Number(row.completed_orders) || 0, availability: row.role === 'provider' ? availability(row) : null,
    nickname: row.nickname || null, referral_code: row.referral_code || null, is_provider: row.role === 'provider',
    conversation_id: row.conversation_id ? Number(row.conversation_id) : null,
  })));
});

const add = asyncHandler(async (req, res) => {
  const id = providerId(req.params.providerId);
  if (!id || id === req.user.id) return error(res, req.t('invalid_data'), 400);
  // A provider, or anyone the user already chats with (AYK-109), under an optional name.
  const contact = await queryOne(`SELECT u.id, u.role,
      EXISTS (SELECT 1 FROM conversation_participants a JOIN conversation_participants b ON b.conversation_id = a.conversation_id
        WHERE a.user_id = ? AND b.user_id = u.id) AS chatted
    FROM users u WHERE u.id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0`, [req.user.id, id]);
  if (!contact || (contact.role !== 'provider' && !contact.chatted)) return notFound(res);
  const nickname = typeof req.body?.nickname === 'string' && req.body.nickname.trim() ? req.body.nickname.trim().slice(0, 80) : null;
  await query(`INSERT INTO saved_providers (user_id, provider_id, nickname) VALUES (?, ?, ?)
    ON CONFLICT (user_id, provider_id) DO UPDATE SET nickname = COALESCE(EXCLUDED.nickname, saved_providers.nickname)`, [req.user.id, id, nickname]);
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
