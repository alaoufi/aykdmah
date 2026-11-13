const { query, queryOne, transaction } = require('../config/database');
const { money, pagination, invalid } = require('./Payment');

const VERIFIED_PAYMENT = `EXISTS (SELECT 1 FROM payments p WHERE p.id = provider_badges.payment_id
  AND p.user_id = provider_badges.user_id AND p.status = 'completed'
  AND p.amount = provider_badges.monthly_fee + provider_badges.insurance_amount
  AND p.currency = 'SAR' AND LOWER(p.provider) NOT IN ('mock', 'stub', '')
  AND p.provider_transaction_id IS NOT NULL AND p.paid_at IS NOT NULL
  AND p.metadata->>'badge_id' = provider_badges.id::text)`;

function verifiedPaymentSql(alias = 'provider_badges') {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw invalid('Invalid SQL alias');
  return VERIFIED_PAYMENT.replace(/provider_badges\./g, `${alias}.`);
}

const SELECT = `
  pb.*, u.full_name AS user_name, u.avatar AS user_avatar,
  approver.full_name AS approver_name
`;

async function findById(id) {
  return queryOne(
    `SELECT ${SELECT}
     FROM provider_badges pb
     JOIN users u ON pb.user_id = u.id
     LEFT JOIN users approver ON pb.approved_by = approver.id
     WHERE pb.id = ?`,
    [id]
  );
}

// All badges for a user (so the buy page can show current state per type)
async function listForUser(userId) {
  return query(
    `SELECT ${SELECT}
     FROM provider_badges pb
     JOIN users u ON pb.user_id = u.id
     LEFT JOIN users approver ON pb.approved_by = approver.id
     WHERE pb.user_id = ?
     ORDER BY pb.created_at DESC`,
    [userId]
  );
}

// The single active OR in-flight badge of a given type for a user
// (we only let the provider have one open application per type at a time).
async function findOpenForType(userId, type) {
  return queryOne(
    `SELECT * FROM provider_badges
     WHERE user_id = ? AND badge_type = ?
       AND status IN ('requested', 'approved', 'awaiting_payment', 'active')
     ORDER BY id DESC LIMIT 1`,
    [userId, type]
  );
}

async function create(data) {
  if (!['trusted', 'featured'].includes(data.badge_type)) throw invalid('Invalid badge type');
  const id = await transaction(async conn => {
    const [users] = await conn.execute('SELECT role FROM users WHERE id = ? FOR UPDATE', [data.user_id]);
    if (users[0]?.role !== 'provider') throw invalid('Provider account required', 403);
    const [open] = await conn.execute("SELECT id FROM provider_badges WHERE user_id = ? AND badge_type = ? AND status IN ('requested', 'approved', 'awaiting_payment', 'active') LIMIT 1", [data.user_id, data.badge_type]);
    if (open.length) return null;
    const [result] = await conn.execute(
    `INSERT INTO provider_badges
      (user_id, badge_type, status, monthly_fee, insurance_required, insurance_amount, notes)
     VALUES (?, ?, 'requested', ?, ?, ?, ?)`,
    [data.user_id, data.badge_type, money(data.monthly_fee ?? 0),
     data.insurance_required ? 1 : 0, money(data.insurance_amount ?? 0),
     data.notes || null]
  );
    return result.insertId;
  });
  return id ? findById(id) : null;
}

async function approve(id, adminId) {
  const result = await query(
    `UPDATE provider_badges
        SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
            rejected_at = NULL, rejection_reason = NULL
      WHERE id = ? AND status = 'requested'`,
    [adminId, id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function reject(id, adminId, reason) {
  if (reason != null && (typeof reason !== 'string' || reason.length > 10000)) throw invalid('Invalid rejection reason');
  const result = await query(
    `UPDATE provider_badges
        SET status = 'rejected', approved_by = ?, rejected_at = CURRENT_TIMESTAMP,
            rejection_reason = ?
      WHERE id = ? AND status IN ('requested', 'approved', 'awaiting_payment')`,
    [adminId, reason || null, id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function markAwaitingPayment(id) {
  await query(
    "UPDATE provider_badges SET status = 'awaiting_payment' WHERE id = ? AND status = 'approved'",
    [id]
  );
  return findById(id);
}

async function activate(id, { paymentId, durationDays }) {
  if (!Number.isSafeInteger(Number(durationDays)) || Number(durationDays) < 1 || Number(durationDays) > 3650) throw invalid('Invalid badge duration');
  return transaction(async conn => {
  const [result] = await conn.execute(
    `UPDATE provider_badges
        SET status = 'active', payment_id = ?, paid_at = CURRENT_TIMESTAMP,
            starts_at = CURRENT_TIMESTAMP,
            ends_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)
      WHERE id = ? AND status = 'awaiting_payment' AND ${VERIFIED_PAYMENT.replace('provider_badges.payment_id', '?')}`,
    [paymentId || null, durationDays, id, paymentId || null]
  );
  if (!result.affectedRows) throw invalid('Verified payment required', 409);
  const [rows] = await conn.execute('SELECT * FROM provider_badges WHERE id = ?', [id]);
  const row = rows[0];
  // Mirror to the denormalised flag on provider_profiles.
  const col = row.badge_type === 'trusted' ? 'badge_trusted' : 'badge_featured';
  await conn.execute(
    `UPDATE provider_profiles
        SET ${col}_active = 1, ${col}_until = ?
      WHERE user_id = ?`,
    [row.ends_at, row.user_id]
  );
  return row;
  });
}

async function cancel(id) {
  const result = await query(
    "UPDATE provider_badges SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('requested', 'approved', 'awaiting_payment')",
    [id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function listPaginated({ status, badge_type, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (Number(page) - 1) * Number(limit);
  const where = ['1=1'];
  const params = [];
  if (status)     { where.push('pb.status = ?');     params.push(status); }
  if (badge_type) { where.push('pb.badge_type = ?'); params.push(badge_type); }
  const whereSql = where.join(' AND ');
  const items = await query(
    `SELECT ${SELECT}
     FROM provider_badges pb
     JOIN users u ON pb.user_id = u.id
     LEFT JOIN users approver ON pb.approved_by = approver.id
     WHERE ${whereSql}
     ORDER BY pb.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM provider_badges pb WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

// Sweep — flip expired stored flags to 0 so the lists don't have to
// keep checking until in every query. Called from a few endpoints
// lazily; safe to run any time.
async function expireOverdue() {
  await query(
    `UPDATE provider_badges
        SET status = 'expired'
      WHERE status = 'active' AND ((ends_at IS NOT NULL AND ends_at <= CURRENT_TIMESTAMP) OR NOT ${VERIFIED_PAYMENT})`
  );
  await query(
    `UPDATE provider_profiles
        SET badge_trusted_active = 0
      WHERE badge_trusted_active = 1 AND (badge_trusted_until <= CURRENT_TIMESTAMP OR NOT EXISTS
        (SELECT 1 FROM provider_badges WHERE user_id = provider_profiles.user_id AND badge_type = 'trusted' AND status = 'active'))`
  );
  await query(
    `UPDATE provider_profiles
        SET badge_featured_active = 0
      WHERE badge_featured_active = 1 AND (badge_featured_until <= CURRENT_TIMESTAMP OR NOT EXISTS
        (SELECT 1 FROM provider_badges WHERE user_id = provider_profiles.user_id AND badge_type = 'featured' AND status = 'active'))`
  );
}

module.exports = {
  findById, listForUser, findOpenForType, create,
  approve, reject, markAwaitingPayment, activate, cancel,
  listPaginated, expireOverdue, verifiedPaymentSql,
};
