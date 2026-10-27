const { query, queryOne, transaction } = require('../config/database');

function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function validId(value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
}
function money(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw invalid('Invalid amount');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) throw invalid('Invalid amount');
  return Math.round(n * 100) / 100;
}
function pagination(page, limit) {
  if (!validId(page) || !validId(limit)) throw invalid('Invalid pagination');
  page = Number(page); limit = Number(limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw invalid('Invalid pagination');
  return { page, limit, offset: (page - 1) * limit };
}

async function create({ user_id, subscription_id, request_id, provider, amount, currency = 'SAR', payment_method, metadata }) {
  amount = money(amount);
  if (!validId(user_id) || (subscription_id != null && !validId(subscription_id)) || (request_id != null && !validId(request_id)) ||
      typeof provider !== 'string' || !provider.trim() || provider.length > 50 || currency !== 'SAR' ||
      (payment_method != null && (typeof payment_method !== 'string' || payment_method.length > 50))) throw invalid('Invalid payment');
  const result = await query(
    `INSERT INTO payments (user_id, subscription_id, request_id, provider, amount, currency, payment_method, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user_id, subscription_id || null, request_id || null, provider, amount, currency,
     payment_method || null, metadata ? JSON.stringify(metadata) : null]
  );
  return queryOne('SELECT * FROM payments WHERE id = ?', [result.insertId]);
}

async function findById(id) {
  return queryOne('SELECT * FROM payments WHERE id = ?', [id]);
}

async function findByTransactionId(txId) {
  return queryOne('SELECT * FROM payments WHERE provider_transaction_id = ?', [txId]);
}

async function updateStatus(id, status, providerTxId, metadata) {
  const transitions = {
    processing: ['pending'], completed: ['pending', 'processing'],
    failed: ['pending', 'processing'], cancelled: ['pending', 'processing'], refunded: ['completed'],
  };
  if (!validId(id) || !transitions[status] || (providerTxId != null && (typeof providerTxId !== 'string' || !providerTxId || providerTxId.length > 190))) throw invalid('Invalid payment status');
  const fields = ['status = ?'];
  const values = [status];
  if (providerTxId !== undefined) {
    fields.push('provider_transaction_id = ?');
    values.push(providerTxId);
  }
  if (metadata) {
    fields.push('metadata = ?');
    values.push(JSON.stringify(metadata));
  }
  if (status === 'completed') fields.push('paid_at = CURRENT_TIMESTAMP');
  if (status === 'refunded') fields.push('refunded_at = CURRENT_TIMESTAMP');
  values.push(id);
  values.push(...transitions[status]);
  await query(`UPDATE payments SET ${fields.join(', ')} WHERE id = ? AND status IN (${transitions[status].map(() => '?').join(',')})`, values);
  return findById(id);
}

async function listForUser(userId, { page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (page - 1) * limit;
  const items = await query(
    `SELECT * FROM payments WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM payments WHERE user_id = ?',
    [userId]
  );
  return { items, total };
}

// A future gateway must authenticate the webhook and supply all financial
// fields. A transaction commits payment settlement and entitlement together.
async function settleVerified(verification) {
  if (verification.authenticated !== true || !verification.transaction_id || !verification.provider ||
      ['mock', 'stub'].includes(String(verification.provider).toLowerCase()) || verification.currency !== 'SAR') throw invalid('Unverified payment', 400);
  const amount = money(verification.amount);
  return transaction(async conn => {
    const [rows] = await conn.execute('SELECT * FROM payments WHERE provider_transaction_id = ? FOR UPDATE', [verification.transaction_id]);
    if (rows.length !== 1) throw invalid('Payment not found', 404);
    const payment = rows[0];
    if (payment.provider !== verification.provider || payment.currency !== verification.currency || money(payment.amount) !== amount) throw invalid('Payment mismatch', 400);
    if (payment.status === 'completed') return { payment, changed: false };
    if (!['pending', 'processing'].includes(payment.status) || !['completed', 'failed'].includes(verification.status)) throw invalid('Invalid payment state', 409);
    await conn.execute('UPDATE payments SET status = ?, paid_at = CASE WHEN ? = \'completed\' THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE id = ?', [verification.status, verification.status, payment.id]);
    if (verification.status === 'completed' && payment.subscription_id) {
      await require('./Subscription').activateSubscription(payment.subscription_id, { paymentId: payment.id, conn });
    }
    return { payment: { ...payment, status: verification.status }, changed: true };
  });
}

module.exports = { create, findById, findByTransactionId, updateStatus, listForUser, settleVerified, money, validId, pagination, invalid };
