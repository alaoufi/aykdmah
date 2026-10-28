const { query, queryOne } = require('../config/database');

// Marketing statistics for the admin panel (AYK-030): who signed up, for which
// professions, where, who benefited, and what invitations brought and cost.
// Admins and the disposable test accounts are left out of every figure.
const PEOPLE = `u.deleted_at IS NULL AND u.role IN ('client', 'provider') AND COALESCE(u.email, '') NOT LIKE '%@ayk-test.local'`;
const CLIENT_SIDE = `(u.role = 'client' OR (u.role = 'provider' AND u.also_client = 1))`;
const num = value => Number(value || 0);
const money = value => Math.round(Number(value || 0) * 100) / 100;

// An optional sign-up period; dates are YYYY-MM-DD and the end day is inclusive.
function period({ from, to } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const clauses = [], params = [];
  if (day.test(String(from || ''))) { clauses.push('u.created_at >= ?::date'); params.push(from); }
  if (day.test(String(to || ''))) { clauses.push(`u.created_at < ?::date + INTERVAL '1 day'`); params.push(to); }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function summary(range) {
  const row = await queryOne(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE u.role = 'client') AS clients,
      COUNT(*) FILTER (WHERE u.role = 'provider' AND u.also_client = 0) AS providers,
      COUNT(*) FILTER (WHERE u.role = 'provider' AND u.also_client = 1) AS both,
      COUNT(*) FILTER (WHERE u.phone_verified_at IS NOT NULL) AS phone_verified,
      COUNT(*) FILTER (WHERE u.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days') AS new_7d,
      COUNT(*) FILTER (WHERE u.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days') AS new_30d,
      COUNT(*) FILTER (WHERE u.last_seen_at > CURRENT_TIMESTAMP - INTERVAL '30 days') AS active_30d,
      COUNT(*) FILTER (WHERE u.referred_by IS NOT NULL) AS invited
    FROM users u WHERE ${PEOPLE}${range.sql}`, range.params);
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, num(value)]));
}

// New accounts per day for the last 30 days, split by side.
async function signupsDaily() {
  const rows = await query(`SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      COUNT(u.id) FILTER (WHERE u.role = 'client') AS clients,
      COUNT(u.id) FILTER (WHERE u.role = 'provider') AS providers
    FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
    LEFT JOIN users u ON u.created_at::date = d.day::date AND ${PEOPLE}
    GROUP BY d.day ORDER BY d.day`);
  return rows.map(row => ({ day: row.day, clients: num(row.clients), providers: num(row.providers) }));
}

// Supply and demand per profession: providers offering any of its services
// against the requests clients made for it.
async function professions(range) {
  const rows = await query(`SELECT c.id, c.name_ar, c.name_en, c.name_translations,
      (SELECT COUNT(DISTINCT pp.user_id) FROM provider_profiles pp JOIN users u ON u.id = pp.user_id
        WHERE ${PEOPLE} AND u.role = 'provider'${range.sql}
          AND (pp.category_id = c.id OR EXISTS (SELECT 1 FROM services s WHERE s.category_id = c.id
            AND jsonb_typeof(pp.service_ids) = 'array' AND pp.service_ids @> jsonb_build_array(s.id)))) AS providers,
      (SELECT COUNT(*) FROM requests r WHERE r.category_id = c.id AND r.deleted_at IS NULL) AS requests,
      (SELECT COUNT(*) FROM requests r WHERE r.category_id = c.id AND r.deleted_at IS NULL AND r.status = 'completed') AS completed
    FROM categories c WHERE c.deleted_at IS NULL AND c.is_active = 1`, [...range.params]);
  return rows.map(row => ({ id: num(row.id), name_ar: row.name_ar, name_en: row.name_en, name_translations: row.name_translations,
    providers: num(row.providers), requests: num(row.requests), completed: num(row.completed) }))
    .sort((a, b) => b.providers - a.providers || b.requests - a.requests);
}

// Accounts and requests per region, city and district.
async function geography(range) {
  const level = async (table, column, limit) => query(`SELECT t.id, t.name_ar, t.name_en${table === 'districts' ? ', ci.name_ar AS city_ar, ci.name_en AS city_en' : ''},
      COUNT(u.id) FILTER (WHERE ${CLIENT_SIDE}) AS clients,
      COUNT(u.id) FILTER (WHERE u.role = 'provider') AS providers,
      (SELECT COUNT(*) FROM requests r WHERE ${table === 'regions'
        ? 'r.city_id IN (SELECT id FROM cities WHERE region_id = t.id)' /* requests record the city, not the region */
        : `r.${column} = t.id`} AND r.deleted_at IS NULL) AS requests
    FROM ${table} t
    ${table === 'districts' ? 'LEFT JOIN cities ci ON ci.id = t.city_id' : ''}
    JOIN users u ON u.${column} = t.id AND ${PEOPLE}${range.sql}
    GROUP BY t.id, t.name_ar, t.name_en${table === 'districts' ? ', ci.name_ar, ci.name_en' : ''}
    ORDER BY COUNT(u.id) DESC, t.id LIMIT ${limit}`, range.params);
  const shape = rows => rows.map(row => ({ ...row, id: num(row.id), clients: num(row.clients), providers: num(row.providers), requests: num(row.requests) }));
  const [regions, cities, districts] = await Promise.all([level('regions', 'region_id', 20), level('cities', 'city_id', 30), level('districts', 'district_id', 50)]);
  return { regions: shape(regions), cities: shape(cities), districts: shape(districts) };
}

// Who actually used the service.
async function beneficiaries() {
  const row = await queryOne(`SELECT
      (SELECT COUNT(DISTINCT r.client_id) FROM requests r JOIN users u ON u.id = r.client_id WHERE ${PEOPLE} AND r.deleted_at IS NULL) AS clients_requested,
      (SELECT COUNT(DISTINCT r.client_id) FROM requests r JOIN users u ON u.id = r.client_id WHERE ${PEOPLE} AND r.status = 'completed') AS clients_served,
      (SELECT COUNT(DISTINCT o.provider_id) FROM offers o JOIN users u ON u.id = o.provider_id WHERE ${PEOPLE}) AS providers_offered,
      (SELECT COUNT(DISTINCT r.assigned_provider_id) FROM requests r JOIN users u ON u.id = r.assigned_provider_id WHERE ${PEOPLE} AND r.status = 'completed') AS providers_earned,
      (SELECT COUNT(*) FROM requests r WHERE r.deleted_at IS NULL) AS requests,
      (SELECT COUNT(*) FROM requests r WHERE r.status = 'completed') AS completed`);
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, num(value)]));
}

// Invitations: who brought whom, and the money they generated and cost.
async function referrals(range) {
  const [totals, top, budget] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS invited,
        COUNT(*) FILTER (WHERE u.role = 'provider') AS invited_providers,
        COUNT(*) FILTER (WHERE u.role = 'client') AS invited_clients
      FROM users u WHERE ${PEOPLE} AND u.referred_by IS NOT NULL${range.sql}`, range.params),
    query(`SELECT ref.id, ref.full_name, ref.referral_code, COUNT(u.id) AS invited,
        COALESCE((SELECT SUM(rr.amount) FROM referral_rewards rr WHERE rr.referrer_id = ref.id), 0) AS rewards,
        COALESCE((SELECT SUM(rr.payment_amount) FROM referral_rewards rr WHERE rr.referrer_id = ref.id), 0) AS payments
      FROM users u JOIN users ref ON ref.id = u.referred_by
      WHERE ${PEOPLE}${range.sql}
      GROUP BY ref.id, ref.full_name, ref.referral_code ORDER BY COUNT(u.id) DESC, ref.id LIMIT 20`, range.params),
    queryOne(`SELECT
        (SELECT COUNT(*) FROM referral_rewards) AS rewards_count,
        (SELECT COALESCE(SUM(amount), 0) FROM referral_rewards) AS rewards_total,
        (SELECT COALESCE(SUM(payment_amount), 0) FROM referral_rewards) AS referred_payments,
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status = 'paid') AS withdrawals_paid,
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status = 'pending') AS withdrawals_pending,
        (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE status = 'completed') AS wallet_balances,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed' AND LOWER(provider) NOT IN ('mock', 'stub', '')
          AND provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL) AS revenue`),
  ]);
  return {
    invited: num(totals?.invited), invited_providers: num(totals?.invited_providers), invited_clients: num(totals?.invited_clients),
    top: top.map(row => ({ id: num(row.id), full_name: row.full_name, referral_code: row.referral_code,
      invited: num(row.invited), rewards: money(row.rewards), payments: money(row.payments) })),
    budget: Object.fromEntries(Object.entries(budget || {}).map(([key, value]) => [key, key === 'rewards_count' ? num(value) : money(value)])),
  };
}

async function marketingStats(filters = {}) {
  const range = period(filters);
  const [totals, daily, byProfession, places, served, invitations] = await Promise.all([
    summary(range), signupsDaily(), professions(range), geography(range), beneficiaries(), referrals(range),
  ]);
  return { period: { from: filters.from || null, to: filters.to || null }, summary: totals, signups_daily: daily,
    professions: byProfession, geography: places, beneficiaries: served, referrals: invitations };
}

module.exports = { marketingStats };
