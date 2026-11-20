const { query, queryOne } = require('../config/database');
const { success, error, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { availability } = require('../utils/providerAvailability');
const { COVERAGE_SQL, coverageOf } = require('../utils/providerCoverage');

// "My directory" (AYK-041): providers a requester keeps to contact again without
// posting a request. Contacting one opens a direct request (requestController.direct).
const providerId = value => (/^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : null);

const { hideRequesterNames } = require('../utils/requesterPrivacy');
const Conversation = require('../models/Conversation');
const { BIO_SQL, bioFor, readerOf } = require('../utils/providerBio');
const list = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT u.id, u.full_name, u.avatar, u.is_verified, pp.business_name, pp.category_id, ${BIO_SQL},
      CASE WHEN u.role = 'provider' THEN pp.rating_avg ELSE (SELECT COALESCE(AVG(rv.rating),0) FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = 'on_requester' AND rv.is_visible = 1) END AS rating_avg,
      CASE WHEN u.role = 'provider' THEN pp.rating_count ELSE (SELECT COUNT(*) FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = 'on_requester' AND rv.is_visible = 1) END AS rating_count, pp.completed_orders,
      (SELECT rv.comment FROM reviews rv WHERE rv.target_user_id = u.id AND rv.review_type = CASE WHEN u.role = 'provider' THEN 'on_provider' ELSE 'on_requester' END AND rv.is_visible = 1 AND rv.comment IS NOT NULL AND rv.comment <> '' ORDER BY rv.id DESC LIMIT 1) AS opinion,
      cat.name_ar AS category_name, cat.name_en AS category_name_en, cat.name_translations AS category_name_translations,
      dist.name_ar AS district_name_ar, dist.name_en AS district_name_en,
      to_jsonb(pp)->>'availability_status' AS availability_status, to_jsonb(pp)->>'vacation_from' AS vacation_from,
      to_jsonb(pp)->>'vacation_to' AS vacation_to, to_jsonb(pp)->>'work_days' AS work_days,
      to_jsonb(pp)->>'work_from' AS work_from, to_jsonb(pp)->>'work_to' AS work_to,
      to_jsonb(pp)->'work_schedule' AS work_schedule, ${COVERAGE_SQL}
      , sp.nickname, u.referral_code, u.role, u.is_online, u.phone, pp.show_phone, pp.whatsapp, pp.show_whatsapp,
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
    opinion: row.opinion || null, ...(row.role === 'provider' ? bioFor(row, readerOf(req)) : {}),
    rating_avg: Number(row.rating_avg) || 0, rating_count: Number(row.rating_count) || 0,
    completed_orders: Number(row.completed_orders) || 0, availability: row.role === 'provider' ? availability(row) : null,
    coverage: row.role === 'provider' ? coverageOf(row) : null,
    nickname: row.nickname || null, referral_code: row.referral_code || null, is_provider: row.role === 'provider',
    conversation_id: row.conversation_id ? Number(row.conversation_id) : null, can_message: row.can_message,
    // The numbers a provider chose to show (AYK-314); never a requester's.
    ...(row.role === 'provider' ? publicContact(row) : { public_phone: null, public_whatsapp: null }),
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

// ---- contacts the person types in themselves (AYK-261, the owner's decision) -----------------
// A name, a mobile number, optionally another WhatsApp number, and notes. Their own notes: not
// tied to any account and never copied from one, so they stay whatever happens to that person's
// account. At most 200 per person.
const CONTACTS_MAX = 200;
const plainText = (value, max) => (typeof value === 'string' && !value.includes('\0') ? value.trim().slice(0, max) : '');
const { phoneNumber, sameNumberKey, publicContact } = require('../utils/providerContact');

// AYK-314: a number is kept once in «دليلي». A number typed in that is already there (in another
// typed-in contact, or as the shown number of a kept provider) is refused, naming where it is.
async function numberAlreadyKept(req, fields, exceptId = 0) {
  const wanted = new Set([fields.phone, fields.whatsapp].filter(Boolean).map(sameNumberKey));
  const typed = await query('SELECT id, name, phone, whatsapp FROM directory_contacts WHERE user_id = ? AND id <> ?', [req.user.id, exceptId]);
  for (const row of typed) if ([row.phone, row.whatsapp].some(n => n && wanted.has(sameNumberKey(n)))) return row.name;
  const kept = await query(`SELECT u.full_name, pp.business_name, u.phone, pp.show_phone, pp.whatsapp, pp.show_whatsapp
    FROM saved_providers sp JOIN users u ON u.id = sp.provider_id AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
    JOIN provider_profiles pp ON pp.user_id = u.id WHERE sp.user_id = ?`, [req.user.id]);
  for (const row of kept) {
    const shown = publicContact(row);
    if ([shown.public_phone, shown.public_whatsapp].some(n => n && wanted.has(sameNumberKey(n)))) return row.business_name || row.full_name;
  }
  return null;
}
function contactFields(req) {
  const name = plainText(req.body?.name, 80), phone = phoneNumber(req.body?.phone);
  const rawWhatsapp = req.body?.whatsapp, whatsapp = rawWhatsapp == null || String(rawWhatsapp).trim() === '' ? null : phoneNumber(rawWhatsapp);
  const rawNotes = req.body?.notes;
  if (!name || !phone || whatsapp === '' || (rawNotes != null && (typeof rawNotes !== 'string' || rawNotes.length > 1000 || rawNotes.includes('\0')))) return null;
  return { name, phone, whatsapp, notes: plainText(rawNotes, 1000) || null };
}
const contactRow = row => ({ id: Number(row.id), name: row.name, phone: row.phone, whatsapp: row.whatsapp || null, notes: row.notes || null });

const listContacts = asyncHandler(async (req, res) => success(res,
  (await query('SELECT id, name, phone, whatsapp, notes FROM directory_contacts WHERE user_id = ? ORDER BY id DESC', [req.user.id])).map(contactRow)));

const addContact = asyncHandler(async (req, res) => {
  const fields = contactFields(req);
  if (!fields) return error(res, req.t('invalid_data'), 400);
  const count = await queryOne('SELECT COUNT(*) AS n FROM directory_contacts WHERE user_id = ?', [req.user.id]);
  if (Number(count.n) >= CONTACTS_MAX) return error(res, req.t('directory_contacts_full'), 409);
  const already = await numberAlreadyKept(req, fields);
  if (already) return error(res, req.t('directory_number_exists', { name: already }), 409);
  const made = await query('INSERT INTO directory_contacts (user_id, name, phone, whatsapp, notes) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, fields.name, fields.phone, fields.whatsapp, fields.notes]);
  return success(res, { id: Number(made.insertId), ...fields }, req.t('directory_added'), 201);
});

const updateContact = asyncHandler(async (req, res) => {
  const id = providerId(req.params.contactId), fields = contactFields(req);
  if (!id) return notFound(res);
  if (!fields) return error(res, req.t('invalid_data'), 400);
  const already = await numberAlreadyKept(req, fields, id);
  if (already) return error(res, req.t('directory_number_exists', { name: already }), 409);
  const changed = await query('UPDATE directory_contacts SET name = ?, phone = ?, whatsapp = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [fields.name, fields.phone, fields.whatsapp, fields.notes, id, req.user.id]);
  if (!changed.affectedRows) return notFound(res);
  return success(res, { id, ...fields });
});

const removeContact = asyncHandler(async (req, res) => {
  const id = providerId(req.params.contactId);
  if (!id) return notFound(res);
  await query('DELETE FROM directory_contacts WHERE id = ? AND user_id = ?', [id, req.user.id]);
  return success(res, { removed: true }, req.t('directory_removed'));
});

const ids = asyncHandler(async (req, res) => {
  const rows = await query('SELECT provider_id FROM saved_providers WHERE user_id = ?', [req.user.id]);
  return success(res, rows.map(row => Number(row.provider_id)));
});

module.exports = { list, add, remove, ids, chat, listContacts, addContact, updateContact, removeContact, _internal: { phoneNumber } };
