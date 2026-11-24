// AYK-490 (the owner: «في حالة عرض الجميع يعرضها للمشاهدة فقط ولا يسمح بالتواصل إلا من في مهنته
// وحدود منطقته»): a provider may look at any open request, but writes to its owner only when the
// request is in his profession and inside his coverage. Returns null when allowed, otherwise the
// reason: 'profession' or 'area'.
const { query, queryOne } = require('../config/database');

const idsOf = value => {
  if (Array.isArray(value)) return value.map(Number);
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch (_) { return []; }
};

async function whyNotServing(providerId, request) {
  if (request.direct_provider_id && Number(request.direct_provider_id) === Number(providerId)) return null;
  const me = await queryOne(`SELECT u.city_id, pp.category_id, pp.service_ids, pp.coverage_city_id
    FROM users u LEFT JOIN provider_profiles pp ON pp.user_id = u.id WHERE u.id = ?`, [providerId]);
  if (!me) return 'profession';

  // Profession: the request's profession is the provider's own, or one of his services belongs to it.
  let wanted = request.category_id ? Number(request.category_id) : null;
  const wantedService = request.service_id ? Number(request.service_id) : null;
  if (!wanted && wantedService) wanted = Number((await queryOne('SELECT category_id FROM services WHERE id = ?', [wantedService]))?.category_id) || null;
  if (wanted) {
    const mine = idsOf(me.service_ids);
    const categories = new Set(me.category_id ? [Number(me.category_id)] : []);
    if (mine.length) for (const row of await query(`SELECT category_id FROM services WHERE id IN (${mine.map(() => '?').join(', ')})`, mine)) categories.add(Number(row.category_id));
    if (!categories.has(wanted)) return 'profession';
  }

  // Coverage: the districts he chose; without any, his coverage city (else his home city).
  if (!request.city_id && !request.district_id) return null;
  const districts = (await query('SELECT pcd.district_id, d.city_id FROM provider_coverage_districts pcd JOIN districts d ON d.id = pcd.district_id WHERE pcd.user_id = ?', [providerId]));
  if (districts.length) {
    if (request.district_id) return districts.some(row => Number(row.district_id) === Number(request.district_id)) ? null : 'area';
    return districts.some(row => Number(row.city_id) === Number(request.city_id)) ? null : 'area';
  }
  const city = Number(me.coverage_city_id || me.city_id) || null;
  return city && Number(request.city_id) === city ? null : 'area';
}

module.exports = { whyNotServing };
