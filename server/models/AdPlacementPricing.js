const { query, queryOne, transaction } = require('../config/database');
const { money, invalid } = require('./Payment');

async function listAll() {
  return query('SELECT * FROM ad_placement_pricing ORDER BY placement ASC');
}

// Returns a map keyed by placement so the quote engine can do
// per-placement lookups in O(1).
async function asMap() {
  const rows = await listAll();
  const map = Object.create(null);
  for (const r of rows) map[r.placement] = r;
  return map;
}

async function findByPlacement(placement) {
  return queryOne('SELECT * FROM ad_placement_pricing WHERE placement = ?', [placement]);
}

async function upsert({ placement, price_per_day, price_per_1k_views, exclusive_multiplier, is_active }, conn = null) {
  if (typeof placement !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(placement) || ![undefined, true, false, 0, 1].includes(is_active)) throw invalid('Invalid placement pricing');
  price_per_day = money(price_per_day); price_per_1k_views = money(price_per_1k_views); exclusive_multiplier = money(exclusive_multiplier);
  if (exclusive_multiplier < 1 || exclusive_multiplier > 99.99) throw invalid('Invalid exclusive multiplier');
  const sql =
    `INSERT INTO ad_placement_pricing (placement, price_per_day, price_per_1k_views, exclusive_multiplier, is_active)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (placement) DO UPDATE SET
       price_per_day = EXCLUDED.price_per_day,
       price_per_1k_views = EXCLUDED.price_per_1k_views,
       exclusive_multiplier = EXCLUDED.exclusive_multiplier,
       is_active = EXCLUDED.is_active`;
  const params = [placement, price_per_day, price_per_1k_views, exclusive_multiplier, is_active === undefined ? 1 : (is_active ? 1 : 0)];
  if (conn) { await conn.execute(sql, params); return; }
  await query(sql, params);
  return findByPlacement(placement);
}

async function bulkUpsert(items) {
  if (!Array.isArray(items) || !items.length || items.length > 15 || new Set(items.map(it => it?.placement)).size !== items.length) throw invalid('Invalid placement pricing');
  await transaction(async conn => { for (const it of items) await upsert(it, conn); });
}

module.exports = { listAll, asMap, findByPlacement, upsert, bulkUpsert };
