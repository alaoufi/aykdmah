const { query, queryOne } = require('../config/database');
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
  return query(`SELECT d.id, d.name_ar, d.name_en FROM provider_coverage_districts pc
    JOIN districts d ON d.id = pc.district_id WHERE pc.user_id = ? ORDER BY d.name_ar`, [userId]);
}

module.exports = { validateCoverage, saveCoverage, coverageDistricts };
