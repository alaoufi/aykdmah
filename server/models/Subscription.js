const { query, queryOne, transaction } = require('../config/database');
const { money, validId, invalid } = require('./Payment');

function validEntitlementSql(alias = 's', planAlias = 'p') {
  if (![alias, planAlias].every(v => /^[a-z][a-z0-9_]*$/.test(v))) throw invalid('Invalid SQL alias');
  return `(${alias}.status = 'active' AND ${alias}.ends_at > CURRENT_TIMESTAMP
    AND ((${alias}.amount = 0 AND ${planAlias}.price = 0) OR EXISTS (
      SELECT 1 FROM payments entitlement_pay WHERE entitlement_pay.id = ${alias}.payment_id
        AND entitlement_pay.subscription_id = ${alias}.id AND entitlement_pay.user_id = ${alias}.user_id
        AND entitlement_pay.status = 'completed' AND entitlement_pay.amount = ${alias}.amount
        AND entitlement_pay.currency = 'SAR' AND LOWER(entitlement_pay.provider) NOT IN ('mock', 'stub', '')
        AND entitlement_pay.provider_transaction_id IS NOT NULL AND entitlement_pay.paid_at IS NOT NULL)))`;
}

function validatePlan(data, partial = false) {
  const out = { ...data };
  for (const key of ['name_ar', 'name_en', 'slug', 'badge', 'description']) {
    if (out[key] !== undefined && out[key] !== null && (typeof out[key] !== 'string' || out[key].length > (key === 'description' ? 10000 : key === 'badge' ? 50 : 120))) throw invalid('Invalid plan');
  }
  if ((!partial || out.name_ar !== undefined) && (!out.name_ar || !out.name_ar.trim())) throw invalid('Invalid plan name');
  if ((!partial || out.slug !== undefined) && (typeof out.slug !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(out.slug))) throw invalid('Invalid plan slug');
  if (out.price !== undefined) out.price = money(out.price);
  for (const key of ['duration_days', 'max_offers_per_month', 'sort_order', 'search_priority']) {
    if ((key === 'duration_days' && out[key] === null) || typeof out[key] === 'boolean' || Array.isArray(out[key])) throw invalid('Invalid plan limit');
    if (out[key] !== undefined && out[key] !== null && (!Number.isSafeInteger(Number(out[key])) || Number(out[key]) < (key === 'duration_days' ? 1 : 0) || Number(out[key]) > (key === 'duration_days' ? 3650 : 1000000))) throw invalid('Invalid plan limit');
  }
  for (const key of ['is_active', 'is_featured']) {
    if (out[key] !== undefined && ![true, false, 0, 1].includes(out[key])) throw invalid('Invalid plan flag');
    if (out[key] !== undefined) out[key] = out[key] ? 1 : 0;
  }
  if (out.features !== undefined && out.features !== null && (!Array.isArray(out.features) || out.features.length > 100 || out.features.some(v => typeof v !== 'string' || v.length > 500))) throw invalid('Invalid plan features');
  return out;
}

async function listPlans(activeOnly = true) {
  return query(
    `SELECT * FROM subscription_plans ${activeOnly ? 'WHERE is_active = 1' : ''}
     ORDER BY sort_order ASC, price ASC`
  );
}

async function findPlanById(id) {
  if (!validId(id)) throw invalid('Invalid plan ID');
  return queryOne('SELECT * FROM subscription_plans WHERE id = ?', [id]);
}

async function createPlan(data) {
  data = validatePlan(data);
  const features = data.features ? JSON.stringify(data.features) : null;
  const result = await query(
    `INSERT INTO subscription_plans
      (name_ar, name_en, slug, description, price, duration_days, max_offers_per_month,
       is_featured, badge, features, is_active, sort_order, search_priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name_ar, data.name_en || null, data.slug, data.description || null,
      data.price || 0, data.duration_days || 30, data.max_offers_per_month ?? null,
      data.is_featured ? 1 : 0, data.badge || null, features,
      data.is_active === 0 ? 0 : 1, data.sort_order || 0, data.search_priority || 0,
    ]
  );
  return findPlanById(result.insertId);
}

async function updatePlan(id, data) {
  if (!validId(id)) throw invalid('Invalid plan ID');
  data = validatePlan(data, true);
  const allowed = ['name_ar', 'name_en', 'slug', 'description', 'price', 'duration_days',
                   'max_offers_per_month', 'is_featured', 'badge', 'is_active', 'sort_order',
                   'search_priority'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (data.features !== undefined) {
    fields.push('features = ?');
    values.push(data.features ? JSON.stringify(data.features) : null);
  }
  if (!fields.length) return findPlanById(id);
  values.push(id);
  await query(`UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = ?`, values);
  return findPlanById(id);
}

async function deletePlan(id) {
  if (!validId(id)) throw invalid('Invalid plan ID');
  await query('DELETE FROM subscription_plans WHERE id = ?', [id]);
}

async function createSubscription({ user_id, plan_id, amount, payment_id }) {
  if (!validId(user_id) || !validId(plan_id) || payment_id != null) throw invalid('Invalid subscription');
  return transaction(async conn => {
    const [users] = await conn.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [user_id]);
    if (users[0]?.role !== 'provider') throw invalid('Provider account required', 403);
    const [plans] = await conn.execute('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [plan_id]);
    const plan = plans[0];
    if (!plan) throw invalid('Plan not found', 404);
    const [existing] = await conn.execute("SELECT id FROM subscriptions WHERE user_id = ? AND (status = 'pending' OR (status = 'active' AND ends_at > CURRENT_TIMESTAMP)) LIMIT 1", [user_id]);
    if (existing.length) throw invalid('A subscription is already open', 409);
    const [result] = await conn.execute(
      `INSERT INTO subscriptions (user_id, plan_id, status, amount, payment_id, starts_at, ends_at)
       VALUES (?, ?, 'pending', ?, NULL, NULL, NULL)`, [user_id, plan_id, money(plan.price)]);
    return result[0];
  });
}

async function activateSubscription(id, { paymentId = null, conn = null } = {}) {
  if (!validId(id)) throw invalid('Invalid subscription');
  const activate = async connection => {
    const [owners] = await connection.execute('SELECT user_id FROM subscriptions WHERE id = ?', [id]);
    if (!owners[0]) throw invalid('Subscription not found', 404);
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [owners[0].user_id]);
    const [rows] = await connection.execute(
      `SELECT s.*, p.duration_days, p.is_featured, p.is_active AS plan_active, p.price AS plan_price
       FROM subscriptions s JOIN subscription_plans p ON s.plan_id = p.id WHERE s.id = ? FOR UPDATE OF s`, [id]);
    const sub = rows[0];
    // Replayed webhooks cannot extend the entitlement window.
    if (sub.status === 'active') return sub;
    if (sub.status !== 'pending' || !sub.plan_active || !Number.isInteger(Number(sub.duration_days)) || Number(sub.duration_days) < 1 || Number(sub.duration_days) > 3650) throw invalid('Invalid subscription state', 409);
    if (money(sub.amount) > 0) {
      if (!validId(paymentId)) throw invalid('Verified payment required', 409);
      const [payments] = await connection.execute(
        `SELECT id FROM payments WHERE id = ? AND subscription_id = ? AND user_id = ? AND status = 'completed'
         AND amount = ? AND currency = 'SAR' AND LOWER(provider) NOT IN ('mock', 'stub', '')
         AND provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL`, [paymentId, id, sub.user_id, sub.amount]);
      if (!payments.length) throw invalid('Verified payment required', 409);
    } else if (money(sub.plan_price) !== 0) throw invalid('Invalid free subscription', 409);
    await connection.execute("UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active' AND ends_at <= CURRENT_TIMESTAMP", [sub.user_id]);
    const [active] = await connection.execute("SELECT id FROM subscriptions WHERE user_id = ? AND id <> ? AND status = 'active' AND ends_at > CURRENT_TIMESTAMP", [sub.user_id, id]);
    if (active.length) throw invalid('A subscription is already active', 409);
    await connection.execute(
      `UPDATE subscriptions SET status = 'active', payment_id = ?, starts_at = CURRENT_TIMESTAMP,
       ends_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY) WHERE id = ? AND status = 'pending'`, [paymentId, sub.duration_days, id]);
    await connection.execute(
      `UPDATE provider_profiles SET current_subscription_id = ?, is_featured = ?,
       featured_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY) WHERE user_id = ?`, [id, sub.is_featured ? 1 : 0, sub.duration_days, sub.user_id]);
    const [updated] = await connection.execute('SELECT * FROM subscriptions WHERE id = ?', [id]);
    return updated[0];
  };
  return conn ? activate(conn) : transaction(activate);
}

async function cancel(id, userId) {
  if (!validId(id) || !validId(userId)) throw invalid('Invalid subscription');
  return transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [rows] = await conn.execute('SELECT * FROM subscriptions WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!rows[0]) throw invalid('Subscription not found', 404);
    if (!['pending', 'active'].includes(rows[0].status)) throw invalid('Invalid subscription state', 409);
    await conn.execute("UPDATE subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [id, userId]);
    await conn.execute('UPDATE provider_profiles SET current_subscription_id = NULL, is_featured = 0, featured_until = NULL WHERE user_id = ? AND current_subscription_id = ?', [userId, id]);
  });
}

async function getActiveForUser(userId) {
  return queryOne(
    `SELECT s.*, p.name_ar AS plan_name, p.name_en AS plan_name_en,
            p.slug AS plan_slug, p.badge, p.features
     FROM subscriptions s
     JOIN subscription_plans p ON s.plan_id = p.id
     WHERE s.user_id = ? AND ${validEntitlementSql()}
     ORDER BY s.created_at DESC LIMIT 1`,
    [userId]
  );
}

module.exports = {
  listPlans, findPlanById, createPlan, updatePlan, deletePlan,
  createSubscription, activateSubscription, cancel, getActiveForUser, validEntitlementSql,
};
