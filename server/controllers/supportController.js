const { query, queryOne, transaction } = require('../config/database');
const { success, created, error, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');
const { hasPermission } = require('../middleware/roleCheck');
const contentTranslation = require('../services/contentTranslation');

// Messages to the administration (AYK-046): support, suggestions, administration.
// Each thread keeps both sides' replies; the unread counters are the reminders.
// complaint: a complaint about a person, a service or the platform (AYK-212).
const TOPICS = ['support', 'complaint', 'suggestion', 'admin'];
const STATUSES = ['open', 'answered', 'closed'];
const validId = value => /^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
const text = value => (typeof value === 'string' ? value.replace(/\0/g, '').trim() : '');

async function thread(id) {
  const ticket = await queryOne(`SELECT t.*, u.full_name, u.phone, u.referral_code FROM support_tickets t
    JOIN users u ON u.id = t.user_id WHERE t.id = ?`, [id]);
  if (!ticket) return null;
  ticket.messages = await query(`SELECT m.id, m.from_admin, m.body, m.created_at, s.full_name AS sender_name
    FROM support_messages m LEFT JOIN users s ON s.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id`, [id]);
  return ticket;
}

// Each reader reads the other side's messages in their own language (the owner: «الرسائل المتبادلة
// مع الإدارة تصل لكل قارئ بلغته»): the administration always reads Arabic, the writer reads the
// language of their account. `body` stays the original; `body_translated` is added only when a
// translation worked and differs, so a failing translator changes nothing.
async function forReader(ticket, lang, asAdmin) {
  if (!ticket) return ticket;
  const others = (ticket.messages || []).filter(m => Boolean(Number(m.from_admin)) !== asAdmin);
  await contentTranslation.rowsForReader(others, 'body', lang);
  return ticket;
}
// The list's last message, translated only when it came from the other side.
async function lastForReader(rows, lang, asAdmin) {
  const others = rows.filter(row => row.last_body && Boolean(Number(row.last_from_admin)) !== asAdmin);
  await contentTranslation.rowsForReader(others, 'last_body', lang);
  return rows;
}
const userLang = req => contentTranslation.readerLang(req.user.id, req.lang);

// Every active admin who handles these messages is told about a new one (their reminder): the full
// admin, and admins with the users permission that opens «رسائل المستخدمين» (AYK-212).
async function tellAdmins(req, ticketId, body) {
  // AYK-383: the administration accounts (the admin mark), acting as the administration.
  const admins = (await query("SELECT id, role, is_super_admin, permissions FROM users WHERE (is_admin = 1 OR role = 'admin') AND is_active = 1 AND deleted_at IS NULL")).map(a => ({ ...a, role: 'admin' }));
  const readers = admins.filter(row => {
    let permissions = row.permissions;
    if (typeof permissions === 'string') { try { permissions = JSON.parse(permissions); } catch (_) { permissions = []; } }
    return hasPermission({ ...row, is_super_admin: Number(row.is_super_admin) ? 1 : 0, permissions: Array.isArray(permissions) ? permissions : [] }, 'users.manage');
  });
  await notificationService.broadcast(readers.map(row => row.id), {
    type: 'support_new', title: req.t('support_new_title'), body: body.slice(0, 120), link: `/admin/support/${ticketId}`,
  });
}

// ---- The writer (any signed-in user) ----------------------------------------
const listMine = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT t.id, t.topic, t.status, t.user_unread, t.created_at, t.updated_at,
      (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT from_admin FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_from_admin
    FROM support_tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC LIMIT 100`, [req.user.id]);
  return success(res, await lastForReader(rows, await userLang(req), false));
});

const create = asyncHandler(async (req, res) => {
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'support';
  const body = text(req.body?.body);
  if (!body || body.length > 4000) return error(res, req.t('support_body_required'), 400);
  const id = await transaction(async conn => {
    const [ticket] = await conn.execute('INSERT INTO support_tickets (user_id, topic, admin_unread) VALUES (?, ?, 1)', [req.user.id, topic]);
    await conn.execute('INSERT INTO support_messages (ticket_id, sender_id, from_admin, body) VALUES (?, ?, 0, ?)', [ticket.insertId, req.user.id, body]);
    return ticket.insertId;
  });
  contentTranslation.prepare(body, 'ar');
  await tellAdmins(req, id, body);
  return created(res, await forReader(await thread(id), await userLang(req), false), req.t('support_sent'));
});

const getMine = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const ticket = await thread(req.params.id);
  if (!ticket || Number(ticket.user_id) !== Number(req.user.id)) return notFound(res);
  await query('UPDATE support_tickets SET user_unread = 0 WHERE id = ?', [ticket.id]);
  await forReader(ticket, await userLang(req), false);
  return success(res, { ...ticket, user_unread: 0 });
});

const replyMine = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const ticket = await queryOne('SELECT id, user_id FROM support_tickets WHERE id = ?', [req.params.id]);
  if (!ticket || Number(ticket.user_id) !== Number(req.user.id)) return notFound(res);
  const body = text(req.body?.body);
  if (!body || body.length > 4000) return error(res, req.t('support_body_required'), 400);
  await query('INSERT INTO support_messages (ticket_id, sender_id, from_admin, body) VALUES (?, ?, 0, ?)', [ticket.id, req.user.id, body]);
  await query("UPDATE support_tickets SET admin_unread = admin_unread + 1, status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [ticket.id]);
  contentTranslation.prepare(body, 'ar');
  await tellAdmins(req, ticket.id, body);
  return created(res, await forReader(await thread(ticket.id), await userLang(req), false));
});

const unreadMine = asyncHandler(async (req, res) => {
  const row = await queryOne('SELECT COALESCE(SUM(user_unread), 0) AS n FROM support_tickets WHERE user_id = ?', [req.user.id]);
  return success(res, { count: Number(row?.n) || 0 });
});

// ---- The administration -----------------------------------------------------
const adminList = asyncHandler(async (req, res) => {
  const where = ['1 = 1']; const params = [];
  if (STATUSES.includes(req.query.status)) { where.push('t.status = ?'); params.push(req.query.status); }
  if (TOPICS.includes(req.query.topic)) { where.push('t.topic = ?'); params.push(req.query.topic); }
  const rows = await query(`SELECT t.id, t.topic, t.status, t.admin_unread, t.created_at, t.updated_at,
      u.full_name, u.referral_code,
      (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT from_admin FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_from_admin
    FROM support_tickets t JOIN users u ON u.id = t.user_id
    WHERE ${where.join(' AND ')} ORDER BY (t.admin_unread > 0) DESC, t.updated_at DESC LIMIT 200`, params);
  return success(res, await lastForReader(rows, 'ar', true));
});

const adminGet = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const ticket = await thread(req.params.id);
  if (!ticket) return notFound(res);
  await query('UPDATE support_tickets SET admin_unread = 0 WHERE id = ?', [ticket.id]);
  await forReader(ticket, 'ar', true);
  return success(res, { ...ticket, admin_unread: 0 });
});

const adminReply = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  const ticket = await queryOne('SELECT id, user_id FROM support_tickets WHERE id = ?', [req.params.id]);
  if (!ticket) return notFound(res);
  const body = text(req.body?.body);
  if (!body || body.length > 4000) return error(res, req.t('support_body_required'), 400);
  await query('INSERT INTO support_messages (ticket_id, sender_id, from_admin, body) VALUES (?, ?, 1, ?)', [ticket.id, req.user.id, body]);
  await query("UPDATE support_tickets SET user_unread = user_unread + 1, admin_unread = 0, status = 'answered', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [ticket.id]);
  contentTranslation.prepare(body, await contentTranslation.readerLang(ticket.user_id, 'ar'));
  await notificationService.notifyUser(ticket.user_id, {
    type: 'support_reply', title: req.t('support_reply_title'), body: body.slice(0, 120), link: `/support/${ticket.id}`,
  });
  return created(res, await forReader(await thread(ticket.id), 'ar', true));
});

const adminStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id) || !STATUSES.includes(req.body?.status)) return error(res, req.t('invalid_data'), 400);
  const result = await query('UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.body.status, req.params.id]);
  if (!result.affectedRows) return notFound(res);
  return success(res, { status: req.body.status }, req.t('updated'));
});

const adminUnread = asyncHandler(async (req, res) => {
  const row = await queryOne('SELECT COUNT(*) AS n FROM support_tickets WHERE admin_unread > 0');
  return success(res, { count: Number(row?.n) || 0 });
});

module.exports = { listMine, create, getMine, replyMine, unreadMine, adminList, adminGet, adminReply, adminStatus, adminUnread, TOPICS };
