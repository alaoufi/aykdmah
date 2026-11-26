// AYK-508 (the owner: «في حال نشر أي طلب أو تقديم خدمة يذكر بالرسالة أي منطقة وأي مهنة، وبلغة …»): the profession and
// the area (region, city) of a request, named in the language of whoever reads the notice.
const { queryOne } = require('../config/database');

const pick = (lang, ar, en, translations) => {
  if (lang === 'ar') return ar || en || '';
  let map = translations;
  if (typeof map === 'string') { try { map = JSON.parse(map); } catch (_) { map = null; } }
  return (map && map[lang]) || en || ar || '';
};

// One lookup per request; the names come back with every language so each reader gets his own.
async function loadScope(request) {
  const row = await queryOne(`
    SELECT cat.name_ar AS cat_ar, cat.name_en AS cat_en, cat.name_translations AS cat_tr,
           city.name_ar AS city_ar, city.name_en AS city_en, city.name_translations AS city_tr,
           reg.name_ar AS reg_ar, reg.name_en AS reg_en, reg.name_translations AS reg_tr
      FROM requests r
      LEFT JOIN categories cat ON cat.id = r.category_id
      LEFT JOIN cities city ON city.id = r.city_id
      LEFT JOIN governorates g ON g.id = city.governorate_id
      LEFT JOIN regions reg ON reg.id = COALESCE(city.region_id, g.region_id)
     WHERE r.id = ?`, [request.id]).catch(() => null);
  return row || {};
}

function scopeIn(row, lang) {
  const profession = pick(lang, row.cat_ar, row.cat_en, row.cat_tr);
  const parts = [pick(lang, row.reg_ar, row.reg_en, row.reg_tr), pick(lang, row.city_ar, row.city_en, row.city_tr)].filter(Boolean);
  return { profession, area: parts.filter((p, i) => parts.indexOf(p) === i).join('، ') };
}

module.exports = { loadScope, scopeIn };
