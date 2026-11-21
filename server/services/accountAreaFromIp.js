// AYK-396 (the owner: «أول دخول يأخذ موقعه آليًا بدون طلب»). A new account that has no area gets
// its region and city from its connection (the same coarse IP lookup the ads already use), with no
// prompt on the phone. Only the region and city: never a point, never a district (an IP is not that
// precise). Kept only while the account has no city: anything the person chooses later wins.
const { query, queryOne } = require('../config/database');
const ipGeo = require('./ipGeoService');
const logger = require('../utils/logger');

const norm = value => String(value || '').trim().toLowerCase().replace(/^al[-\s]/, '').replace(/^ال/, '');

async function findCity(name, regionId) {
  if (!name) return null;
  const rows = await query(
    `SELECT c.id, c.name_ar, c.name_en, COALESCE(c.region_id, g.region_id) AS region_id, c.governorate_id
       FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id
      WHERE c.is_active = 1 ${regionId ? 'AND COALESCE(c.region_id, g.region_id) = ?' : ''}`,
    regionId ? [regionId] : []);
  const wanted = norm(name);
  return rows.find(row => norm(row.name_en) === wanted || norm(row.name_ar) === wanted) || null;
}

// Fills users.region_id / city_id (and country / governorate when those columns exist) from the
// request's connection. Never throws; resolves within `timeoutMs` at most.
async function fillAccountAreaFromIp(req, userId, { timeoutMs = 2500 } = {}) {
  const work = (async () => {
    const user = await queryOne('SELECT id, city_id, region_id FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
    if (!user || user.city_id) return null;
    const geo = await ipGeo.lookup(ipGeo.ipFromRequest(req));
    if (!geo?.region_id) return null;
    const city = await findCity(geo.city, geo.region_id);
    const region = await queryOne('SELECT id, country_id FROM regions WHERE id = ?', [geo.region_id]);
    const cols = await query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('country_id', 'region_id', 'governorate_id')`);
    const has = new Set(cols.map(c => c.column_name));
    const sets = [], values = [];
    if (has.has('region_id')) { sets.push('region_id = ?'); values.push(Number(geo.region_id)); }
    if (has.has('country_id') && region?.country_id) { sets.push('country_id = ?'); values.push(Number(region.country_id)); }
    if (city) {
      sets.push('city_id = ?'); values.push(Number(city.id));
      if (has.has('governorate_id') && city.governorate_id) { sets.push('governorate_id = ?'); values.push(Number(city.governorate_id)); }
    }
    if (!sets.length) return null;
    // Only while still empty: a choice the person made meanwhile is never overwritten.
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND city_id IS NULL`, [...values, userId]);
    return { region_id: Number(geo.region_id), city_id: city ? Number(city.id) : null };
  })().catch(err => { logger.warn(`Account area from IP failed: ${err.message}`); return null; });
  return Promise.race([work, new Promise(resolve => setTimeout(() => resolve(null), timeoutMs).unref?.())]);
}

module.exports = { fillAccountAreaFromIp, findCity };
