const { query, queryOne } = require('../config/database');
const Setting = require('../models/Setting');
const Subscription = require('../models/Subscription');

// Monthly subscriptions by area and profession (AYK-042). Off until the
// administration sets `subscriptions_enabled` to '1'. A provider then needs an
// active subscription to work a profession in an area an active rule covers,
// unless a "free" rule keeps that profession free there. Requesters never pay.

async function enabled() {
  return [true, '1', 'true'].includes(await Setting.get('subscriptions_enabled', '0'));
}

// Whether a subscription is needed for this profession in this city.
async function requiredFor({ categoryId, cityId }) {
  if (!cityId || !await enabled()) return false;
  const city = await queryOne('SELECT region_id FROM cities WHERE id = ?', [cityId]);
  const rows = await query(`SELECT is_free FROM subscription_rules WHERE is_active = 1
    AND (region_id IS NULL OR region_id = ?) AND (city_id IS NULL OR city_id = ?)
    AND (category_id IS NULL OR category_id = ?)`, [city?.region_id || 0, cityId, categoryId || 0]);
  if (rows.some(row => Number(row.is_free) === 1)) return false;
  return rows.length > 0;
}

// Of these providers, the ones with a valid (paid or free-plan) subscription.
async function subscribedIds(ids) {
  if (!ids.length) return new Set();
  const rows = await query(`SELECT DISTINCT s.user_id FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id IN (${ids.map(() => '?').join(', ')}) AND ${Subscription.validEntitlementSql('s', 'p')}`, ids);
  return new Set(rows.map(row => Number(row.user_id)));
}

// Drops providers who would need a subscription for this work and have none.
// rows: [{ id, category_id? }]; categoryOf(row) gives the profession to check.
async function keepAllowed(rows, { cityId, categoryOf }) {
  if (!rows.length || !await enabled()) return rows;
  const cache = new Map();
  const needs = async categoryId => {
    if (!cache.has(categoryId)) cache.set(categoryId, await requiredFor({ categoryId, cityId }));
    return cache.get(categoryId);
  };
  const flagged = [];
  for (const row of rows) if (await needs(categoryOf(row))) flagged.push(Number(row.id));
  if (!flagged.length) return rows;
  const paid = await subscribedIds(flagged);
  return rows.filter(row => !flagged.includes(Number(row.id)) || paid.has(Number(row.id)));
}

// True when this provider may not take up work in this profession and city.
async function blocks(providerId, { categoryId, cityId }) {
  if (!await requiredFor({ categoryId, cityId })) return false;
  return !(await subscribedIds([Number(providerId)])).has(Number(providerId));
}

// For the provider's own panel: which of their professions need a subscription
// in their area, and whether they have one.
async function statusFor(providerId) {
  const on = await enabled();
  if (!on) return { enabled: false, required_category_ids: [], subscribed: false };
  const User = require('../models/User');
  const profile = await User.getProviderProfile(providerId);
  const area = await queryOne('SELECT COALESCE(pp.coverage_city_id, u.city_id) AS city_id FROM users u LEFT JOIN provider_profiles pp ON pp.user_id = u.id WHERE u.id = ?', [providerId]);
  const required = [];
  for (const categoryId of profile?.category_ids || []) {
    if (await requiredFor({ categoryId, cityId: area?.city_id })) required.push(Number(categoryId));
  }
  return { enabled: true, required_category_ids: required, subscribed: (await subscribedIds([Number(providerId)])).has(Number(providerId)) };
}

module.exports = { enabled, requiredFor, keepAllowed, blocks, statusFor, subscribedIds };
