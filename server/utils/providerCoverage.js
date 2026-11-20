const { query, queryOne, tableHasColumn } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

const validId = value => ['number', 'string'].includes(typeof value)
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;

// A provider covers neighbourhoods of ONE city. An empty list means the whole
// city, which is also the only choice for a city without active districts.
async function validateCoverage(input, { cityId = null, required = false, message = 'Invalid coverage' } = {}) {
  const hasCity = input.coverage_city_id !== undefined && input.coverage_city_id !== null && input.coverage_city_id !== '';
  const hasDistricts = input.coverage_district_ids !== undefined;
  if (!hasCity && !hasDistricts && !required) return null;
  const city = hasCity ? input.coverage_city_id : cityId;
  if (!validId(city) || !await queryOne('SELECT id FROM cities WHERE id = ? AND is_active = 1', [Number(city)])) throw new ApiError(message, 400);
  const ids = hasDistricts ? input.coverage_district_ids : [];
  if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => !validId(id))) throw new ApiError(message, 400);
  const districts = [...new Set(ids.map(Number))];
  if (districts.length) {
    const rows = await query(`SELECT id FROM districts WHERE id IN (${districts.map(() => '?').join(', ')})
      AND city_id = ? AND is_active = 1`, [...districts, Number(city)]);
    if (rows.length !== districts.length) throw new ApiError(message, 400);
  } else if (required && await queryOne('SELECT id FROM districts WHERE city_id = ? AND is_active = 1 LIMIT 1', [Number(city)])) {
    throw new ApiError(message, 400);
  }
  return { coverage_city_id: Number(city), coverage_district_ids: districts };
}

// `execute` is a transaction connection's execute or the pool query.
async function saveCoverage(execute, userId, coverage) {
  await execute('UPDATE provider_profiles SET coverage_city_id = ? WHERE user_id = ?', [coverage.coverage_city_id, userId]);
  await execute('DELETE FROM provider_coverage_districts WHERE user_id = ?', [userId]);
  for (const districtId of coverage.coverage_district_ids) {
    await execute('INSERT INTO provider_coverage_districts (user_id, district_id) VALUES (?, ?)', [userId, districtId]);
  }
}

async function coverageDistricts(userId) {
  if (!await tableHasColumn('provider_coverage_districts', 'district_id')) return [];
  return query(`SELECT d.id, d.name_ar, d.name_en FROM provider_coverage_districts pc
    JOIN districts d ON d.id = pc.district_id WHERE pc.user_id = ? ORDER BY d.name_ar`, [userId]);
}

// AYK-366 (the owner: «في عرض مقدمي الخدمة وضّح تغطيته»): where a provider works, for the cards.
// The coverage city is the one they chose, else their home city; an explicit list of districts
// narrows it (none = the whole city). `u` is the provider's users row and `pp` their profile.
const COVERAGE_SQL = `
  (SELECT jsonb_build_object('ar', cov_city.name_ar, 'en', cov_city.name_en, 'tr', cov_city.name_translations)
     FROM cities cov_city WHERE cov_city.id = COALESCE(pp.coverage_city_id, u.city_id)) AS coverage_city,
  (SELECT COUNT(*) FROM provider_coverage_districts cov_count WHERE cov_count.user_id = u.id) AS coverage_districts_count,
  (SELECT jsonb_agg(jsonb_build_object('ar', picked.name_ar, 'en', picked.name_en) ORDER BY picked.name_ar)
     FROM (SELECT cov_d.name_ar, cov_d.name_en FROM provider_coverage_districts cov_pick
           JOIN districts cov_d ON cov_d.id = cov_pick.district_id WHERE cov_pick.user_id = u.id
           ORDER BY cov_d.name_ar LIMIT 6) picked) AS coverage_districts_list`;

const parse = value => {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch (_) { return null; } }
  return value ?? null;
};

// The shape the cards read: { city: {ar,en,tr}, districts: [{ar,en}] (up to 6), districts_count }.
function coverageOf(row) {
  const city = parse(row.coverage_city);
  const districts = parse(row.coverage_districts_list) || [];
  return { city: city || null, districts, districts_count: Number(row.coverage_districts_count) || 0 };
}

module.exports = { validateCoverage, saveCoverage, coverageDistricts, COVERAGE_SQL, coverageOf };
