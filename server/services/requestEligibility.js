// AYK-490 (the owner: «في حالة عرض الجميع يعرضها للمشاهدة فقط ولا يسمح بالتواصل إلا من في مهنته
// وحدود منطقته»): a provider may look at any open request, but writes to its owner only when the
// request is in his profession and inside his coverage. Returns null when allowed, otherwise the
// reason: 'profession' or 'area'.
const { query, queryOne } = require('../config/database');

const idsOf = value => {
  if (Array.isArray(value)) return value.map(Number);
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch (_) { return []; }
};

// What decides it, read once for a provider so a whole list can be judged without a query per row.
async function loadReach(providerId) {
  const me = await queryOne(`SELECT u.city_id, pp.category_id, pp.service_ids, pp.coverage_city_id
    FROM users u LEFT JOIN provider_profiles pp ON pp.user_id = u.id WHERE u.id = ?`, [providerId]);
  const services = new Map((await query('SELECT id, category_id FROM services')).map(row => [Number(row.id), Number(row.category_id)]));
  const categories = new Set(me?.category_id ? [Number(me.category_id)] : []);
  for (const id of idsOf(me?.service_ids)) if (services.has(id)) categories.add(services.get(id));
  const coverage = me ? await query('SELECT pcd.district_id, d.city_id FROM provider_coverage_districts pcd JOIN districts d ON d.id = pcd.district_id WHERE pcd.user_id = ?', [providerId]) : [];
  const blocks = await query('SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?', [providerId, providerId]);
  const blockedWith = new Set(blocks.map(row => Number(row.blocker_id) === Number(providerId) ? Number(row.blocked_id) : Number(row.blocker_id)));
  return { me, services, categories, coverage, blockedWith, providerId: Number(providerId) };
}

// null when the provider may reach the request's owner, else 'profession', 'area' or 'blocked'.
function judge(reach, request) {
  if (!reach.me) return 'profession';
  if (request.direct_provider_id && Number(request.direct_provider_id) === reach.providerId) return null;
  if (Number(request.assigned_provider_id) === reach.providerId) return null;
  let wanted = request.category_id ? Number(request.category_id) : null;
  if (!wanted && request.service_id) wanted = reach.services.get(Number(request.service_id)) || null;
  if (wanted && !reach.categories.has(wanted)) return 'profession';
  if (request.city_id || request.district_id) {
    let covered;
    if (reach.coverage.length) covered = request.district_id
      ? reach.coverage.some(row => Number(row.district_id) === Number(request.district_id))
      : reach.coverage.some(row => Number(row.city_id) === Number(request.city_id));
    else { const city = Number(reach.me.coverage_city_id || reach.me.city_id) || null; covered = Boolean(city) && Number(request.city_id) === city; }
    if (!covered) return 'area';
  }
  if (reach.blockedWith.has(Number(request.client_id))) return 'blocked';
  return null;
}

async function whyNotServing(providerId, request) {
  const why = judge(await loadReach(providerId), request);
  return why === 'blocked' ? null : why; // the block has its own refusal (who blocked whom)
}

// AYK-493 (the owner: «حتى يفتح له محادثة أو تواصل مع مقدم الطلب يجب أن تتحقق ثلاثة شروط: مقدم خدمة من
// نفس المهنة، ضمن حدود التغطية، وغير محظور من طالب الخدمة»). Answers the refusal (and sends it) when a
// provider may not reach the owner of `request`; false when he may. Used by contact, offers and chat opening.
async function refuseProviderContact(req, res, request, providerId) {
  const { forbidden } = require('../utils/apiResponse');
  if (req.user.role !== 'provider' || Number(req.user.id) !== Number(providerId)) { forbidden(res, req.t('deny_providers_only')); return true; }
  // The provider the request was agreed with keeps his chat whatever changed since.
  if (Number(request.assigned_provider_id) === Number(providerId)) return false;
  const why = await whyNotServing(providerId, request);
  if (why) { forbidden(res, req.t(why === 'area' ? 'contact_not_your_area' : 'contact_not_your_profession')); return true; }
  return require('../controllers/userBlockController').blockedRefusal(req, res, request.client_id);
}

module.exports = { whyNotServing, refuseProviderContact, loadReach, judge };
