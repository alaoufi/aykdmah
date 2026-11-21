// AYK-410 (the owner: «ابنِ صفحة ترتيب القوائم»). The administration's own order of its menu: the
// groups and their names, which page sits in which group, and hidden pages. Kept in the settings,
// applied at once to every administrator's menu (no release). Pages added later, unknown to the
// saved order, still appear in their own group.
const asyncHandler = require('../utils/asyncHandler');
const Setting = require('../models/Setting');
const { query } = require('../config/database');
const { success, error } = require('../utils/apiResponse');

const KEY = 'admin_menu_layout';
const PATH = /^\/admin(\/[a-z0-9\-/]*)?$/;
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function clean(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.groups) || body.groups.length > 20) return null;
  const seen = new Set();
  const groups = [];
  for (const g of body.groups) {
    if (!g || !text(g.key, 60) || !Array.isArray(g.items) || g.items.length > 100) return null;
    if (g.title != null && g.title !== '' && !text(g.title, 60)) return null;
    const items = [];
    for (const to of g.items) {
      if (typeof to !== 'string' || !PATH.test(to) || seen.has(to)) return null;
      seen.add(to); items.push(to);
    }
    groups.push({ key: g.key.trim(), title: g.title ? g.title.trim() : null, items });
  }
  const hidden = Array.isArray(body.hidden) ? body.hidden.filter(to => typeof to === 'string' && PATH.test(to)).slice(0, 100) : [];
  // The control home and this page can never be hidden (or nobody could undo it).
  return { groups, hidden: hidden.filter(to => !['/admin', '/admin/menu-layout'].includes(to)) };
}

const get = asyncHandler(async (req, res) => success(res, await Setting.get(KEY, null)));

const save = asyncHandler(async (req, res) => {
  if (req.body?.reset === true) {
    await Setting.set(KEY, null, 'json', 'admin', 0, 'ترتيب قائمة الإدارة');
  } else {
    const layout = clean(req.body);
    if (!layout) return error(res, req.t('invalid_data'), 400);
    await Setting.set(KEY, layout, 'json', 'admin', 0, 'ترتيب قائمة الإدارة');
  }
  await query(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'admin.menu.layout', 'setting', NULL, ?)`,
    [req.user.id, req.body?.reset === true ? 'reset' : 'saved']).catch(() => {});
  return success(res, await Setting.get(KEY, null), req.t('updated'));
});

module.exports = { get, save, clean };
