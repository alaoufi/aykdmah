const { query, queryOne } = require('../config/database');
const { success, error, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { availability } = require('../utils/providerAvailability');

// "My directory" (AYK-041): providers a requester keeps to contact again without
// posting a request. Contacting one opens a direct request (requestController.direct).
const providerId = value => (/^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : null);

const { hideRequesterNames } = require('../utils/requesterPrivacy');
const Conversation = require('../models/Conversation');
const list = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT u.id, u.full_name, u.avatar, u.is_verified, pp.business_name, pp.category_id,
      CASE WHEN u.role = 'provider' THEN pp.rating_avg ELSE (SELECT COALESCE(AVG(rv.rating),0) FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = 'on_requester' AND rv.is_visible = 1) END AS rating_avg,
      CASE WHEN u.role = 'provider' THEN pp.rating_count ELSE (SELECT COUNT(*) FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = 'on_requester' AND rv.is_visible = 1) END AS rating_count, pp.completed_orders,
      (SELECT rv.comment FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = CASE WHEN u.role = 'provider' THEN 'on_provider' ELSE 'on_requester' END AND rv.is_visible = 1 AND rv.comment IS NOT NULL AND rv.comment <> '' ORDER BY rv.id DESC LIMIT 1) AS opinion,
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
  await hideRequesterNames(req.user.id, rows, req.t('requester_label'));
  // Whoever is in my directory can be written to, a provider or not (the owner's decision, AYK-260).
  // A provider through a direct request, as before. Anyone else through a chat with them that is
  // still open; when none is (the contact time after a finished request has passed), `chat`
  // below opens a plain conversation with them. `can_message` is false only here when that plain
  // conversation is what the buttons will use, so the page knows which way to go.
  for (const row of rows) {
    row.can_message = true;
    if (row.role === 'provider') continue;
    const shared = await query(`SELECT c.id FROM conversations c
      JOIN conversation_participants mine ON mine.conversation_id = c.id AND mine.user_id = ?
      JOIN conversation_participants theirs ON theirs.conversation_id = c.id AND theirs.user_id = ?
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC LIMIT 5`, [req.user.id, row.id]);
    let open = null;
    for (const conversation of shared) if (await Conversation.canSend(conversation.id, req.user.id)) { open = conversation.id; break; }
    row.can_message = open !== null;
    if (open !== null) row.conversation_id = open;
  }
  return success(res, rows.map(row => ({
    id: row.id, full_name: row.full_name, business_name: row.business_name, avatar: row.avatar,
    is_verified: Number(row.is_verified) === 1, category_id: row.category_id,
    category_name: row.category_name, category_name_en: row.category_name_en, category_name_translations: row.category_name_translations,
    district_name_ar: row.district_name_ar, district_name_en: row.district_name_en,
    opinion: row.opinion || null,
    rating_avg: Number(row.rating_avg) || 0, rating_count: Number(row.rating_count) || 0,
    completed_orders: Number(row.completed_orders) || 0, availability: row.role === 'provider' ? availability(row) : null,
    nickname: row.nickname || null, referral_code: row.referral_code || null, is_provider: row.role === 'provider',
    conversation_id: row.conversation_id ? Number(row.conversation_id) : null, can_message: row.can_message,
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

// POST /users/me/directory/:providerId/chat (AYK-260): a conversation with someone I keep in my
// directory, whatever their role. An open chat between us is reused; otherwise a plain one (not
// tied to a request) is opened. Only for people in my own directory, and never across a block.
const chat = asyncHandler(async (req, res) => {
  const id = providerId(req.params.providerId);
  if (!id || id === req.user.id) return error(res, req.t('invalid_data'), 400);
  const kept = await queryOne(`SELECT sp.provider_id FROM saved_providers sp
    JOIN users u ON u.id = sp.provider_id AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
    WHERE sp.user_id = ? AND sp.provider_id = ?`, [req.user.id, id]);
  if (!kept) return notFound(res);
  if (await require('./userBlockController').blockedRefusal(req, res, id)) return undefined;
  const shared = await query(`SELECT c.id FROM conversations c
    JOIN conversation_participants mine ON mine.conversation_id = c.id AND mine.user_id = ?
    JOIN conversation_participants theirs ON theirs.conversation_id = c.id AND theirs.user_id = ?
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC LIMIT 5`, [req.user.id, id]);
  for (const conversation of shared) if (await Conversation.canSend(conversation.id, req.user.id)) return success(res, { conversation_id: Number(conversation.id) });
  return success(res, { conversation_id: Number(await Conversation.findOrCreateBetween(req.user.id, id, null)) });
});

const ids = asyncHandler(async (req, res) => {
  const rows = await query('SELECT provider_id FROM saved_providers WHERE user_id = ?', [req.user.id]);
  return success(res, rows.map(row => Number(row.provider_id)));
});

module.exports = { list, add, remove, ids, chat };
