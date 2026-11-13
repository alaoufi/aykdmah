// Referral coupons and provider wallets.
//
// Money rules (all amounts in SAR, handled as integer halalas in code):
// - A balance is never stored. It is the sum of the user's wallet_transactions
//   (credits > 0, debits < 0), excluding cancelled rows.
// - Every operation that can lower a balance locks the owner's users row first,
//   then re-reads the balance inside the same transaction, so concurrent
//   requests can never spend the same money twice.
// - The referrer earns referral_commission_percent of the referred account's
//   FIRST completed gateway payment, exactly once (unique referred_user_id and
//   payment_id in referral_rewards). Payments made from a wallet never earn a
//   commission, so balances cannot be cycled into more balance.
// - Withdrawals and paid gifts require the account password.
const crypto = require('crypto');
const { query, queryOne, transaction } = require('../config/database');
const { comparePassword } = require('../utils/hash');
const Setting = require('../models/Setting');
const notificationService = require('./notificationService');
const { isTestMode } = require('./paymentService');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read like 1 and 0
// Code shapes, shortest first: 2 letters + 2 digits, then more digits, then more letters.
const CODE_TIERS = [[2, 2], [2, 3], [2, 4], [3, 4], [4, 4]];
const ATTEMPTS_PER_TIER = 25;
const IBAN_RE = /^SA\d{22}$/;

function fail(status, code) { return Object.assign(new Error(code), { status, code }); }
const toHalalas = value => Math.round(Number(value) * 100);
const toSar = halalas => Number((halalas / 100).toFixed(2));

function randomCode(letters, digits) {
  let code = '';
  for (let i = 0; i < letters; i += 1) code += LETTERS[crypto.randomInt(LETTERS.length)];
  for (let i = 0; i < digits; i += 1) code += String(crypto.randomInt(10));
  return code;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

// Gives every account its permanent number (idempotent). It is the customer
// number shown in the header and accepted at sign-in; only a provider's number
// earns commission as an invitation (findReferrerByCode).
async function ensureReferralCode(userId) {
  const user = await queryOne('SELECT id, role, referral_code FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  if (user.referral_code) return user.referral_code;
  for (const [letters, digits] of CODE_TIERS) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_TIER; attempt += 1) {
      const code = randomCode(letters, digits);
      try {
        const updated = await query('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL', [code, userId]);
        if (updated.affectedRows === 1) return code;
        return (await queryOne('SELECT referral_code FROM users WHERE id = ?', [userId])).referral_code;
      } catch (err) {
        if (err.code !== '23505') throw err; // unique violation: try another code
      }
    }
  }
  throw fail(500, 'referral_code_exhausted');
}

async function findReferrerByCode(code) {
  const normalized = normalizeCode(code);
  if (!/^[A-Z]{2,4}\d{2,4}$/.test(normalized)) return null;
  return queryOne(`SELECT id, full_name FROM users WHERE referral_code = ? AND role = 'provider'
    AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL`, [normalized]);
}

// Links a new account to a coupon. Allowed once, before the account's first payment.
async function applyReferralCode(userId, code) {
  const referrer = await findReferrerByCode(code);
  if (!referrer) throw fail(404, 'coupon_not_found');
  if (Number(referrer.id) === Number(userId)) throw fail(400, 'coupon_own');
  return transaction(async conn => {
    const [users] = await conn.execute('SELECT id, referred_by FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!users[0]) throw fail(404, 'user_not_found');
    if (users[0].referred_by) throw fail(409, 'coupon_already_used');
    const [paid] = await conn.execute("SELECT id FROM payments WHERE user_id = ? AND status = 'completed' LIMIT 1", [userId]);
    if (paid.length) throw fail(409, 'coupon_after_payment');
    await conn.execute('UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL', [referrer.id, userId]);
    return { referrer_id: referrer.id, referrer_name: referrer.full_name };
  });
}

async function balanceIn(conn, userId) {
  const [rows] = await conn.execute(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE user_id = ? AND status <> 'cancelled'", [userId]);
  return toHalalas(rows[0].total);
}

async function insertTx(conn, { userId, halalas, type, status = 'completed', relatedUserId = null, referenceType = null, referenceId = null, note = null, createdBy = null }) {
  const [result] = await conn.execute(
    `INSERT INTO wallet_transactions (user_id, amount, type, status, related_user_id, reference_type, reference_id, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, toSar(halalas), type, status, relatedUserId, referenceType, referenceId, note, createdBy]);
  return result.insertId;
}

async function commissionPercent() {
  const value = Number(await Setting.get('referral_commission_percent'));
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : 0;
}

// Called inside Payment.settleVerified's transaction when a gateway payment completes.
async function awardReferralIn(conn, payment) {
  if (String(payment.provider).toLowerCase() === 'wallet') return null;
  const [users] = await conn.execute('SELECT id, referred_by FROM users WHERE id = ? FOR UPDATE', [payment.user_id]);
  const referrerId = users[0]?.referred_by;
  if (!referrerId) return null;
  const [earlier] = await conn.execute(
    "SELECT id FROM payments WHERE user_id = ? AND status = 'completed' AND id <> ? AND LOWER(provider) <> 'wallet' LIMIT 1",
    [payment.user_id, payment.id]);
  if (earlier.length) return null; // only the first payment counts
  const [existing] = await conn.execute('SELECT id FROM referral_rewards WHERE referred_user_id = ?', [payment.user_id]);
  if (existing.length) return null;
  const percent = await commissionPercent();
  const halalas = Math.floor(toHalalas(payment.amount) * percent / 100);
  if (halalas <= 0) return null;
  await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [referrerId]);
  const txId = await insertTx(conn, {
    userId: referrerId, halalas, type: 'referral_commission', relatedUserId: payment.user_id,
    referenceType: 'payment', referenceId: payment.id,
    note: String(payment.provider).toLowerCase() === 'test' ? 'test' : null,
  });
  await conn.execute(
    `INSERT INTO referral_rewards (referred_user_id, referrer_id, payment_id, payment_amount, percent, amount, wallet_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [payment.user_id, referrerId, payment.id, payment.amount, percent, toSar(halalas), txId]);
  return { referrerId, amount: toSar(halalas) };
}

async function notifyCommission(reward) {
  if (!reward) return;
  notificationService.notifyUser(reward.referrerId, {
    type: 'referral_commission', title: 'أُضيفت عمولة إلى رصيدك',
    body: `أُضيف ${reward.amount} ريال إلى رصيدك من كوبونك`, link: '/provider/wallet',
  }).catch(() => {});
}

async function requirePassword(userId, password) {
  const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!password || !row || !await comparePassword(String(password), row.password_hash || '')) throw fail(401, 'wrong_password');
}

function parseAmount(value) {
  const halalas = toHalalas(value);
  if (!Number.isSafeInteger(halalas) || halalas <= 0 || String(value).trim() === '' || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) throw fail(400, 'invalid_amount');
  return halalas;
}

async function requestWithdrawal(user, { amount, iban, account_name, password }) {
  // Balances in test mode come from test payments: nothing may leave for a bank.
  if (isTestMode()) throw fail(409, 'test_mode_withdrawals_disabled');
  await requirePassword(user.id, password);
  const halalas = parseAmount(amount);
  const minimum = toHalalas(Number(await Setting.get('wallet_min_withdrawal')) || 0);
  if (halalas < minimum) throw fail(400, 'below_minimum');
  const cleanIban = String(iban || '').toUpperCase().replace(/\s/g, '');
  if (!IBAN_RE.test(cleanIban)) throw fail(400, 'invalid_iban');
  const name = String(account_name || '').trim();
  if (name.length < 3 || name.length > 150) throw fail(400, 'invalid_account_name');
  const id = await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const [open] = await conn.execute("SELECT id FROM withdrawal_requests WHERE user_id = ? AND status = 'pending'", [user.id]);
    if (open.length) throw fail(409, 'withdrawal_pending');
    if (await balanceIn(conn, user.id) < halalas) throw fail(409, 'insufficient_balance');
    const txId = await insertTx(conn, { userId: user.id, halalas: -halalas, type: 'withdrawal', status: 'pending', referenceType: 'withdrawal' });
    const [result] = await conn.execute(
      'INSERT INTO withdrawal_requests (user_id, amount, iban, account_name, wallet_transaction_id) VALUES (?, ?, ?, ?, ?)',
      [user.id, toSar(halalas), cleanIban, name, txId]);
    await conn.execute('UPDATE wallet_transactions SET reference_id = ? WHERE id = ?', [result.insertId, txId]);
    return result.insertId;
  });
  return { id, amount: toSar(halalas), status: 'pending' };
}

async function cancelWithdrawal(user, id) {
  return transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const [rows] = await conn.execute("SELECT * FROM withdrawal_requests WHERE id = ? AND user_id = ? AND status = 'pending' FOR UPDATE", [Number(id), user.id]);
    if (!rows[0]) throw fail(404, 'withdrawal_not_found');
    await conn.execute("UPDATE withdrawal_requests SET status = 'cancelled', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [rows[0].id]);
    await conn.execute("UPDATE wallet_transactions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [rows[0].wallet_transaction_id]);
    return { id: rows[0].id, status: 'cancelled' };
  });
}

// Administrator: mark paid after the bank transfer, or reject and release the hold.
async function processWithdrawal(admin, id, { action, note, transfer_reference }) {
  if (!['paid', 'rejected'].includes(action)) throw fail(400, 'invalid_action');
  if (action === 'paid' && isTestMode()) throw fail(409, 'test_mode_withdrawals_disabled');
  const reference = String(transfer_reference || '').trim().slice(0, 100);
  if (action === 'paid' && reference.length < 3) throw fail(400, 'transfer_reference_required');
  const result = await transaction(async conn => {
    const [rows] = await conn.execute("SELECT * FROM withdrawal_requests WHERE id = ? FOR UPDATE", [Number(id)]);
    const row = rows[0];
    if (!row) throw fail(404, 'withdrawal_not_found');
    if (row.status !== 'pending') throw fail(409, 'withdrawal_not_pending');
    await conn.execute(
      `UPDATE withdrawal_requests SET status = ?, admin_note = ?, transfer_reference = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [action, String(note || '').slice(0, 500) || null, action === 'paid' ? reference : null, admin.id, row.id]);
    await conn.execute('UPDATE wallet_transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [action === 'paid' ? 'completed' : 'cancelled', row.wallet_transaction_id]);
    return row;
  });
  notificationService.notifyUser(result.user_id, {
    type: 'withdrawal_' + action,
    title: action === 'paid' ? 'تم تحويل طلب السحب' : 'رُفض طلب السحب',
    body: action === 'paid' ? `حُوّل ${result.amount} ريال إلى حسابك البنكي` : 'أُعيد المبلغ إلى رصيدك',
    link: '/provider/wallet',
  }).catch(() => {});
  return { id: result.id, status: action };
}

async function findRecipient(identifier, senderId) {
  const value = String(identifier || '').trim();
  if (value.length < 3) throw fail(400, 'recipient_required');
  const code = normalizeCode(value);
  const phone = value.replace(/[\s()-]/g, '');
  const row = await queryOne(`SELECT id, full_name, role FROM users WHERE deleted_at IS NULL AND is_active = 1 AND is_blocked = 0
    AND (referral_code = ? OR LOWER(username) = LOWER(?) OR phone = ?) LIMIT 1`, [code, value, phone]);
  if (!row || row.role !== 'provider') throw fail(404, 'recipient_not_found');
  if (Number(row.id) === Number(senderId)) throw fail(400, 'recipient_self');
  return row;
}

async function previewGift(user, { recipient, plan_id }) {
  const target = await findRecipient(recipient, user.id);
  const plan = await queryOne('SELECT id, name_ar, name_en, price, duration_days FROM subscription_plans WHERE id = ? AND is_active = 1', [Number(plan_id)]);
  if (!plan || toHalalas(plan.price) <= 0) throw fail(404, 'plan_not_found');
  return { recipient: { id: target.id, full_name: target.full_name }, plan };
}

// Pays another provider's subscription from the sender's balance.
async function giftSubscription(user, { recipient, plan_id, password }) {
  await requirePassword(user.id, password);
  const { recipient: target, plan } = await previewGift(user, { recipient, plan_id });
  const halalas = toHalalas(plan.price);
  const Subscription = require('../models/Subscription');
  const outcome = await transaction(async conn => {
    const ids = [Number(user.id), Number(target.id)].sort((a, b) => a - b);
    await conn.execute('SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE', ids);
    if (await balanceIn(conn, user.id) < halalas) throw fail(409, 'insufficient_balance');
    const [open] = await conn.execute(
      "SELECT id FROM subscriptions WHERE user_id = ? AND (status = 'pending' OR (status = 'active' AND ends_at > CURRENT_TIMESTAMP)) LIMIT 1", [target.id]);
    if (open.length) throw fail(409, 'recipient_has_subscription');
    const [subs] = await conn.execute(
      `INSERT INTO subscriptions (user_id, plan_id, status, amount) VALUES (?, ?, 'pending', ?)`, [target.id, plan.id, plan.price]);
    const subscriptionId = subs.insertId;
    const txId = await insertTx(conn, {
      userId: user.id, halalas: -halalas, type: 'gift_subscription', relatedUserId: target.id,
      referenceType: 'subscription', referenceId: subscriptionId,
    });
    // Recorded as a completed payment from the wallet so the subscription rules stay unchanged.
    const [payments] = await conn.execute(
      `INSERT INTO payments (user_id, subscription_id, provider, provider_transaction_id, amount, currency, payment_method, status, paid_at, metadata)
       VALUES (?, ?, 'wallet', ?, ?, 'SAR', 'wallet', 'completed', CURRENT_TIMESTAMP, ?)`,
      [target.id, subscriptionId, `wallet-${txId}`, plan.price, JSON.stringify({ paid_by: user.id, wallet_transaction_id: txId })]);
    await Subscription.activateSubscription(subscriptionId, { paymentId: payments.insertId, conn });
    return { subscriptionId };
  });
  notificationService.notifyUser(target.id, {
    type: 'gift_subscription', title: 'وصلك اشتراك مدفوع',
    body: `دفع ${user.full_name || 'مستخدم'} اشتراكك (${plan.name_ar})`, link: '/provider/subscription',
  }).catch(() => {});
  return { recipient: target, plan, subscription_id: outcome.subscriptionId, amount: toSar(halalas) };
}

async function summary(userId) {
  const code = await ensureReferralCode(userId);
  const totals = await queryOne(`SELECT
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS balance,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN -amount END), 0) AS pending_withdrawals,
      COALESCE(SUM(CASE WHEN type = 'referral_commission' AND status = 'completed' THEN amount END), 0) AS earned
    FROM wallet_transactions WHERE user_id = ?`, [userId]);
  const referrals = await queryOne(`SELECT COUNT(*) AS total,
      (SELECT COUNT(*) FROM referral_rewards WHERE referrer_id = ?) AS paid
    FROM users WHERE referred_by = ?`, [userId, userId]);
  const transactions = await query(`SELECT t.id, t.amount, t.type, t.status, t.created_at, t.note, u.full_name AS related_name
    FROM wallet_transactions t LEFT JOIN users u ON u.id = t.related_user_id
    WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 100`, [userId]);
  const withdrawals = await query(`SELECT id, amount, status, account_name, RIGHT(iban, 4) AS iban_last4, transfer_reference, created_at, processed_at
    FROM withdrawal_requests WHERE user_id = ? ORDER BY id DESC LIMIT 20`, [userId]);
  const me = await queryOne('SELECT referred_by FROM users WHERE id = ?', [userId]);
  const paidBefore = await queryOne("SELECT id FROM payments WHERE user_id = ? AND status = 'completed' LIMIT 1", [userId]);
  return {
    referral_code: code,
    balance: Number(totals.balance), pending_withdrawals: Number(totals.pending_withdrawals), earned: Number(totals.earned),
    referrals: { total: Number(referrals.total), paid: Number(referrals.paid) },
    commission_percent: await commissionPercent(),
    min_withdrawal: Number(await Setting.get('wallet_min_withdrawal')) || 0,
    can_apply_coupon: !me?.referred_by && !paidBefore,
    test_mode: isTestMode(),
    transactions, withdrawals,
  };
}

// Administrator views.
async function adminOverview() {
  const totals = await queryOne(`SELECT
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS liabilities,
      COALESCE(SUM(CASE WHEN type = 'referral_commission' AND status = 'completed' THEN amount END), 0) AS commissions,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN -amount END), 0) AS withdrawn,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'pending' THEN -amount END), 0) AS pending_withdrawals,
      COALESCE(SUM(CASE WHEN type = 'gift_subscription' AND status = 'completed' THEN -amount END), 0) AS gifted
    FROM wallet_transactions`);
  const wallets = await query(`SELECT u.id, u.full_name, u.phone, u.referral_code,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN t.amount END), 0) AS balance,
      COALESCE(SUM(CASE WHEN t.type = 'referral_commission' AND t.status = 'completed' THEN t.amount END), 0) AS earned,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS referrals
    FROM users u JOIN wallet_transactions t ON t.user_id = u.id
    GROUP BY u.id, u.full_name, u.phone, u.referral_code ORDER BY balance DESC LIMIT 200`);
  const withdrawals = await query(`SELECT w.*, u.full_name, u.phone FROM withdrawal_requests w JOIN users u ON u.id = w.user_id
    ORDER BY (w.status = 'pending') DESC, w.id DESC LIMIT 200`);
  const rewards = await query(`SELECT r.*, a.full_name AS referrer_name, b.full_name AS referred_name FROM referral_rewards r
    JOIN users a ON a.id = r.referrer_id JOIN users b ON b.id = r.referred_user_id ORDER BY r.id DESC LIMIT 200`);
  const num = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  return {
    totals: num(totals), commission_percent: await commissionPercent(), test_mode: isTestMode(),
    min_withdrawal: Number(await Setting.get('wallet_min_withdrawal')) || 0,
    wallets: wallets.map(w => ({ ...w, balance: Number(w.balance), earned: Number(w.earned), referrals: Number(w.referrals) })),
    withdrawals, rewards,
  };
}

async function adminLedger(userId) {
  return query(`SELECT t.*, u.full_name AS related_name FROM wallet_transactions t LEFT JOIN users u ON u.id = t.related_user_id
    WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 500`, [Number(userId)]);
}

// Corrections are explicit ledger rows with a reason, never edits of history.
async function adminAdjust(admin, userId, { amount, note }) {
  const raw = String(amount ?? '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw) || toHalalas(raw) === 0) throw fail(400, 'invalid_amount');
  const reason = String(note || '').trim();
  if (reason.length < 5) throw fail(400, 'note_required');
  const halalas = toHalalas(raw);
  return transaction(async conn => {
    const [users] = await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [Number(userId)]);
    if (!users[0]) throw fail(404, 'user_not_found');
    if (halalas < 0 && await balanceIn(conn, users[0].id) + halalas < 0) throw fail(409, 'insufficient_balance');
    const id = await insertTx(conn, { userId: users[0].id, halalas, type: 'admin_adjustment', note: reason.slice(0, 500), createdBy: admin.id });
    return { id, amount: toSar(halalas) };
  });
}

async function setSettings({ commission_percent, min_withdrawal }) {
  if (commission_percent !== undefined) {
    const value = Number(commission_percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw fail(400, 'invalid_percent');
    await Setting.set('referral_commission_percent', String(Math.round(value * 100) / 100), 'number', 'payments', 0);
  }
  if (min_withdrawal !== undefined) {
    const value = Number(min_withdrawal);
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw fail(400, 'invalid_amount');
    await Setting.set('wallet_min_withdrawal', String(Math.round(value * 100) / 100), 'number', 'payments', 0);
  }
  return { commission_percent: await commissionPercent(), min_withdrawal: Number(await Setting.get('wallet_min_withdrawal')) || 0 };
}

module.exports = {
  ensureReferralCode, findReferrerByCode, applyReferralCode, awardReferralIn, notifyCommission,
  requestWithdrawal, cancelWithdrawal, processWithdrawal, previewGift, giftSubscription,
  summary, adminOverview, adminLedger, adminAdjust, setSettings, normalizeCode, CODE_TIERS,
};
