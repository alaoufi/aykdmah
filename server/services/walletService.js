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

// AYK-353 (the owner): account numbers are digits only, easy to type: two digits first, then three,
// then four (and more if ever needed). Old letter codes stay valid (legacy_referral_code).
const CODE_TIERS = [2, 3, 4, 5, 6];
const ATTEMPTS_PER_TIER = 25;
const IBAN_RE = /^SA\d{22}$/;

function fail(status, code) { return Object.assign(new Error(code), { status, code }); }
const toHalalas = value => Math.round(Number(value) * 100);
const toSar = halalas => Number((halalas / 100).toFixed(2));

function randomCode(digits) {
  let code = String(1 + crypto.randomInt(9)); // never a leading zero
  for (let i = 1; i < digits; i += 1) code += String(crypto.randomInt(10));
  return code;
}
// A number of this account: today's digits, or an older letter code (AYK-353).
const ACCOUNT_NUMBER = /^(\d{2,6}|[A-Z]{2,4}\d{2,4})$/;

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

// Gives every account its permanent number (idempotent). It is the customer
// number shown in the header and accepted at sign-in; only a provider's number
// is also their marketing code (AYK-322): any active account's number earns.
async function ensureReferralCode(userId) {
  const user = await queryOne('SELECT id, role, referral_code FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  if (user.referral_code) return user.referral_code;
  for (const digits of CODE_TIERS) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_TIER; attempt += 1) {
      const code = randomCode(digits);
      // Not a number someone already had as their old code either.
      if (await queryOne('SELECT 1 AS x FROM users WHERE legacy_referral_code = ?', [code]).catch(() => null)) continue;
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
  if (!ACCOUNT_NUMBER.test(normalized)) return null;
  // AYK-322 (the owner): every registered account's number is a marketing code, not only a
  // provider's. Administrators are left out.
  return queryOne(`SELECT id, full_name FROM users WHERE (referral_code = ? OR legacy_referral_code = ?) AND role IN ('provider', 'client')
    AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL`, [normalized, normalized]);
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
  }).then(result => { settleCountRewards(result.referrer_id).catch(() => {}); return result; });
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

// AYK-322: marketing by commission. The administration turns it on or off and picks one way a
// marketer earns: `percent` of the invited account's first payment; `count`, a fixed amount for
// each invited service provider once at least N of them registered (nothing to do with subscriptions);
// `subscription`, a fixed amount once an invited provider's subscription is paid and activated.
const MARKETING_MODES = ['percent', 'count', 'subscription'];
async function marketing() {
  const [enabled, mode, every, countAmount, subscriptionAmount] = await Promise.all(
    ['marketing_enabled', 'marketing_mode', 'marketing_count_every', 'marketing_count_amount', 'marketing_subscription_amount'].map(key => Setting.get(key)));
  const amount = value => { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= 100000 ? toHalalas(n) : 0; };
  const n = Math.floor(Number(every));
  return {
    enabled: enabled === true || String(enabled) === 'true',
    mode: MARKETING_MODES.includes(mode) ? mode : 'percent',
    countEvery: Number.isFinite(n) && n >= 1 && n <= 10000 ? n : 0,
    countAmount: amount(countAmount),
    subscriptionAmount: amount(subscriptionAmount),
    percent: await commissionPercent(),
  };
}
const marketingView = cfg => ({
  enabled: cfg.enabled, mode: cfg.mode, percent: cfg.percent, count_every: cfg.countEvery,
  count_amount: toSar(cfg.countAmount), subscription_amount: toSar(cfg.subscriptionAmount),
});

// An invited service provider counts once their account is usable: active, and with at least one
// service chosen (sign-up as a provider asks for it), so empty accounts are not paid for.
const QUALIFIED_PROVIDER = `r.role = 'provider' AND r.is_active = 1 AND r.is_blocked = 0 AND r.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM provider_profiles pp WHERE pp.user_id = r.id
    AND pp.service_ids IS NOT NULL AND CAST(pp.service_ids AS TEXT) NOT IN ('', '[]', 'null'))`;

// The `count` way (the owner's rule): below the minimum number of invited providers nothing is due;
// from the minimum on, the amount is due for EVERY invited provider (10 at 5 SAR = 50, the 11th
// adds 5). `counted` records how many were paid for, so nobody is paid for twice. Safe to call at
// any time and any number of times; it does nothing when marketing is off or in another mode.
async function settleCountRewards(referrerId) {
  const cfg = await marketing();
  if (!cfg.enabled || cfg.mode !== 'count' || !cfg.countEvery || !cfg.countAmount) return 0;
  const paidFor = await transaction(async conn => {
    const [users] = await conn.execute('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [Number(referrerId)]);
    if (!users[0]) return 0;
    const [qualified] = await conn.execute(`SELECT COUNT(*) AS n FROM users r WHERE r.referred_by = ? AND ${QUALIFIED_PROVIDER}`, [users[0].id]);
    if (Number(qualified[0].n) < cfg.countEvery) return 0; // the minimum is not reached yet
    const [used] = await conn.execute('SELECT COALESCE(SUM(counted), 0) AS n FROM referral_count_rewards WHERE referrer_id = ?', [users[0].id]);
    const due = Number(qualified[0].n) - Number(used[0].n);
    if (due <= 0) return 0;
    const txId = await insertTx(conn, { userId: users[0].id, halalas: cfg.countAmount * due, type: 'referral_count_reward', referenceType: 'referral_count' });
    await conn.execute('INSERT INTO referral_count_rewards (referrer_id, counted, amount, wallet_transaction_id) VALUES (?, ?, ?, ?)',
      [users[0].id, due, toSar(cfg.countAmount * due), txId]);
    return due;
  });
  if (paidFor > 0) {
    notificationService.notifyUser(Number(referrerId), {
      type: 'referral_commission', title: 'أُضيفت مكافأة تسويق إلى رصيدك',
      body: `أُضيف ${toSar(cfg.countAmount * paidFor)} ريال إلى رصيدك عن ${paidFor} من مقدمي الخدمة سجّلوا بكودك`, link: '/wallet',
    }).catch(() => {});
  }
  return paidFor;
}

// Called after an invited provider's profile changes (their services), which is when they start to count.
async function settleCountRewardsForInvited(userId) {
  const row = await queryOne('SELECT referred_by FROM users WHERE id = ?', [Number(userId)]);
  if (row?.referred_by) await settleCountRewards(row.referred_by);
}

// Called inside Payment.settleVerified's transaction when a gateway payment completes.
async function awardReferralIn(conn, payment) {
  if (String(payment.provider).toLowerCase() === 'wallet') return null;
  const cfg = await marketing();
  // Off, or the `count` way (which has nothing to do with payments): no commission from a payment.
  if (!cfg.enabled || cfg.mode === 'count') return null;
  // The `subscription` way pays only for a subscription payment. settleVerified activates the
  // subscription in this same transaction just before this call, so it is paid and active here.
  if (cfg.mode === 'subscription' && !payment.subscription_id) return null;
  const [users] = await conn.execute('SELECT id, referred_by FROM users WHERE id = ? FOR UPDATE', [payment.user_id]);
  const referrerId = users[0]?.referred_by;
  if (!referrerId) return null;
  if (cfg.mode === 'percent') {
    const [earlier] = await conn.execute(
      "SELECT id FROM payments WHERE user_id = ? AND status = 'completed' AND id <> ? AND LOWER(provider) <> 'wallet' LIMIT 1",
      [payment.user_id, payment.id]);
    if (earlier.length) return null; // only the first payment counts
  }
  // Once per invited account, whichever way: the first subscription, not every renewal.
  const [existing] = await conn.execute('SELECT id FROM referral_rewards WHERE referred_user_id = ?', [payment.user_id]);
  if (existing.length) return null;
  const percent = cfg.mode === 'percent' ? cfg.percent : 0;
  const halalas = cfg.mode === 'percent' ? Math.floor(toHalalas(payment.amount) * percent / 100) : cfg.subscriptionAmount;
  if (halalas <= 0) return null;
  await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [referrerId]);
  const txId = await insertTx(conn, {
    userId: referrerId, halalas, type: 'referral_commission', relatedUserId: payment.user_id,
    referenceType: 'payment', referenceId: payment.id,
    note: String(payment.provider).toLowerCase() === 'test' ? 'test' : null,
  });
  await conn.execute(
    `INSERT INTO referral_rewards (referred_user_id, referrer_id, payment_id, payment_amount, percent, amount, wallet_transaction_id, mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [payment.user_id, referrerId, payment.id, payment.amount, percent, toSar(halalas), txId, cfg.mode]);
  return { referrerId, amount: toSar(halalas) };
}

async function notifyCommission(reward) {
  if (!reward) return;
  notificationService.notifyUser(reward.referrerId, {
    type: 'referral_commission', title: 'أُضيفت عمولة إلى رصيدك',
    body: `أُضيف ${reward.amount} ريال إلى رصيدك من كودك`, link: '/wallet',
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
    // AYK-240: commissions earned from test payments (note 'test') never become bank money, even
    // after test mode is switched off for a real gateway.
    const [testCredits] = await conn.execute(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE user_id = ? AND note = 'test' AND amount > 0 AND status <> 'cancelled'", [user.id]);
    if (await balanceIn(conn, user.id) - toHalalas(testCredits[0].total) < halalas) throw fail(409, 'insufficient_balance');
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
    link: '/wallet',
  }).catch(() => {});
  return { id: result.id, status: action };
}

async function findRecipient(identifier, senderId) {
  const value = String(identifier || '').trim();
  // AYK-353: an account number can be two digits now (27).
  if (value.length < 2) throw fail(400, 'recipient_required');
  const code = normalizeCode(value);
  const phone = value.replace(/[\s()-]/g, '');
  const row = await queryOne(`SELECT id, full_name, role FROM users WHERE deleted_at IS NULL AND is_active = 1 AND is_blocked = 0
    AND (referral_code = ? OR legacy_referral_code = ? OR LOWER(username) = LOWER(?) OR phone = ?) LIMIT 1`, [code, code, value, phone]);
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
    // AYK-253: like withdrawals (AYK-240), a gift cannot be paid with commissions earned from test
    // payments: they would become real subscriptions once a real gateway is switched on.
    const [testCredits] = await conn.execute(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE user_id = ? AND note = 'test' AND amount > 0 AND status <> 'cancelled'", [user.id]);
    if (await balanceIn(conn, user.id) - toHalalas(testCredits[0].total) < halalas) throw fail(409, 'insufficient_balance');
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
  await settleCountRewards(userId).catch(() => {});
  const cfg = await marketing();
  const totals = await queryOne(`SELECT
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS balance,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN -amount END), 0) AS pending_withdrawals,
      COALESCE(SUM(CASE WHEN type IN ('referral_commission', 'referral_count_reward') AND status = 'completed' THEN amount END), 0) AS earned,
      COALESCE(SUM(CASE WHEN type IN ('withdrawal', 'cash_payout') AND status = 'completed' THEN -amount END), 0) AS paid_out
    FROM wallet_transactions WHERE user_id = ?`, [userId]);
  const referrals = await queryOne(`SELECT COUNT(*) AS total,
      (SELECT COUNT(*) FROM referral_rewards WHERE referrer_id = ?) AS paid,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = ? AND ${QUALIFIED_PROVIDER}) AS providers,
      (SELECT COALESCE(SUM(counted), 0) FROM referral_count_rewards WHERE referrer_id = ?) AS counted
    FROM users WHERE referred_by = ?`, [userId, userId, userId, userId]);
  // Who joined with my code: the name, when, and where they stand. Nothing else about them.
  const invited = await query(`SELECT r.id, r.full_name, r.role, r.created_at,
      CASE WHEN ${QUALIFIED_PROVIDER} THEN 1 ELSE 0 END AS counts,
      (SELECT rw.amount FROM referral_rewards rw WHERE rw.referred_user_id = r.id) AS commission
    FROM users r WHERE r.referred_by = ? AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 200`, [userId]);
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
    paid_out: Number(totals.paid_out),
    referrals: { total: Number(referrals.total), paid: Number(referrals.paid), providers: Number(referrals.providers),
      // The `count` way: how many of my invited providers are waiting for the next block.
      toward_next: Math.max(0, Number(referrals.providers) - Number(referrals.counted)) },
    marketing: marketingView(cfg),
    invited: invited.map(row => ({ id: row.id, name: row.full_name, role: row.role, created_at: row.created_at,
      counts: Number(row.counts) === 1, commission: row.commission == null ? null : Number(row.commission) })),
    commission_percent: await commissionPercent(),
    min_withdrawal: Number(await Setting.get('wallet_min_withdrawal')) || 0,
    can_apply_coupon: !me?.referred_by && !paidBefore,
    test_mode: isTestMode(),
    transactions, withdrawals,
  };
}

// Administrator views.
async function adminOverview() {
  const cfg = await marketing();
  // The `count` way: settle whoever has a complete block waiting, so the statement is current.
  if (cfg.enabled && cfg.mode === 'count' && cfg.countEvery && cfg.countAmount) {
    const waiting = await query(`SELECT r.referred_by AS id FROM users r WHERE r.referred_by IS NOT NULL AND ${QUALIFIED_PROVIDER}
      GROUP BY r.referred_by HAVING COUNT(*) >= ?
        AND COUNT(*) > COALESCE((SELECT SUM(c.counted) FROM referral_count_rewards c WHERE c.referrer_id = r.referred_by), 0) LIMIT 200`, [cfg.countEvery]);
    for (const row of waiting) await settleCountRewards(row.id).catch(() => {});
  }
  // The marketers' statement: everyone whose code was used, what they earned, what was paid, what is owed.
  const marketers = await query(`SELECT u.id, u.full_name, u.phone, u.referral_code, u.role,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS referrals,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id AND ${QUALIFIED_PROVIDER}) AS providers,
      (SELECT COUNT(*) FROM referral_rewards rw WHERE rw.referrer_id = u.id) AS paid_subscribers,
      COALESCE((SELECT SUM(t.amount) FROM wallet_transactions t WHERE t.user_id = u.id AND t.type IN ('referral_commission', 'referral_count_reward') AND t.status = 'completed'), 0) AS earned,
      COALESCE((SELECT SUM(-t.amount) FROM wallet_transactions t WHERE t.user_id = u.id AND t.type IN ('withdrawal', 'cash_payout') AND t.status = 'completed'), 0) AS paid_out,
      COALESCE((SELECT SUM(t.amount) FROM wallet_transactions t WHERE t.user_id = u.id AND t.status <> 'cancelled'), 0) AS balance
    FROM users u WHERE EXISTS (SELECT 1 FROM users r WHERE r.referred_by = u.id)
    ORDER BY earned DESC, referrals DESC LIMIT 300`);
  const totals = await queryOne(`SELECT
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS liabilities,
      COALESCE(SUM(CASE WHEN type IN ('referral_commission', 'referral_count_reward') AND status = 'completed' THEN amount END), 0) AS commissions,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN -amount END), 0) AS withdrawn,
      COALESCE(SUM(CASE WHEN type = 'cash_payout' AND status = 'completed' THEN -amount END), 0) AS cash_paid,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'pending' THEN -amount END), 0) AS pending_withdrawals,
      COALESCE(SUM(CASE WHEN type = 'gift_subscription' AND status = 'completed' THEN -amount END), 0) AS gifted
    FROM wallet_transactions`);
  const wallets = await query(`SELECT u.id, u.full_name, u.phone, u.referral_code,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN t.amount END), 0) AS balance,
      COALESCE(SUM(CASE WHEN t.type IN ('referral_commission', 'referral_count_reward') AND t.status = 'completed' THEN t.amount END), 0) AS earned,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS referrals
    FROM users u JOIN wallet_transactions t ON t.user_id = u.id
    GROUP BY u.id, u.full_name, u.phone, u.referral_code ORDER BY balance DESC LIMIT 200`);
  const withdrawals = await query(`SELECT w.*, u.full_name, u.phone FROM withdrawal_requests w JOIN users u ON u.id = w.user_id
    ORDER BY (w.status = 'pending') DESC, w.id DESC LIMIT 200`);
  const rewards = await query(`SELECT r.*, a.full_name AS referrer_name, b.full_name AS referred_name FROM referral_rewards r
    JOIN users a ON a.id = r.referrer_id JOIN users b ON b.id = r.referred_user_id ORDER BY r.id DESC LIMIT 200`);
  const num = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  return {
    totals: num(totals), commission_percent: cfg.percent, test_mode: isTestMode(),
    marketing: marketingView(cfg),
    marketers: marketers.map(m => ({ ...m, referrals: Number(m.referrals), providers: Number(m.providers),
      paid_subscribers: Number(m.paid_subscribers), earned: Number(m.earned), paid_out: Number(m.paid_out), balance: Number(m.balance) })),
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

// A marketer was paid in cash (the `count` way is settled like this): one ledger row that lowers
// the balance, with who paid and a note. Never more than the balance.
async function adminCashPayout(admin, userId, { amount, note }) {
  const halalas = parseAmount(amount);
  const reason = String(note || '').trim();
  if (reason.length < 5) throw fail(400, 'note_required');
  const result = await transaction(async conn => {
    const [users] = await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [Number(userId)]);
    if (!users[0]) throw fail(404, 'user_not_found');
    if (await balanceIn(conn, users[0].id) < halalas) throw fail(409, 'insufficient_balance');
    const id = await insertTx(conn, { userId: users[0].id, halalas: -halalas, type: 'cash_payout', note: reason.slice(0, 500), createdBy: admin.id });
    return { id, user_id: users[0].id, amount: toSar(halalas) };
  });
  notificationService.notifyUser(result.user_id, {
    type: 'withdrawal_paid', title: 'سُلّمت لك عمولتك نقدًا',
    body: `سُجّل تسليم ${result.amount} ريال نقدًا وخُصم من رصيدك`, link: '/wallet',
  }).catch(() => {});
  return result;
}

async function setSettings({ commission_percent, min_withdrawal, marketing_enabled, marketing_mode, count_every, count_amount, subscription_amount }) {
  if (marketing_enabled !== undefined) {
    if (![true, false, 'true', 'false', 0, 1].includes(marketing_enabled)) throw fail(400, 'invalid_data');
    await Setting.set('marketing_enabled', [true, 'true', 1].includes(marketing_enabled), 'boolean', 'payments', 0);
  }
  if (marketing_mode !== undefined) {
    if (!MARKETING_MODES.includes(marketing_mode)) throw fail(400, 'invalid_data');
    await Setting.set('marketing_mode', marketing_mode, 'string', 'payments', 0);
  }
  if (count_every !== undefined) {
    const value = Number(count_every);
    if (!Number.isInteger(value) || value < 1 || value > 10000) throw fail(400, 'invalid_data');
    await Setting.set('marketing_count_every', String(value), 'number', 'payments', 0);
  }
  for (const [key, value] of [['marketing_count_amount', count_amount], ['marketing_subscription_amount', subscription_amount]]) {
    if (value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw fail(400, 'invalid_amount');
    await Setting.set(key, String(Math.round(n * 100) / 100), 'number', 'payments', 0);
  }
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
  return { commission_percent: await commissionPercent(), min_withdrawal: Number(await Setting.get('wallet_min_withdrawal')) || 0,
    marketing: marketingView(await marketing()) };
}

module.exports = {
  settleCountRewards, settleCountRewardsForInvited, adminCashPayout,
  ensureReferralCode, findReferrerByCode, applyReferralCode, awardReferralIn, notifyCommission,
  requestWithdrawal, cancelWithdrawal, processWithdrawal, previewGift, giftSubscription,
  summary, adminOverview, adminLedger, adminAdjust, setSettings, normalizeCode, CODE_TIERS,
};
