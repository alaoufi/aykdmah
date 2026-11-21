// AYK-420: «كلمات اللهجة» in the administration: the words the site learned from requests, with
// their profession and counts; approve (always use, optionally with another profession) or block.
const asyncHandler = require('../utils/asyncHandler');
const { query, queryOne } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const dialect = require('../services/dialectLearning');

const list = asyncHandler(async (req, res) => {
  const rows = await dialect.allTerms();
  return success(res, { min_hits: dialect.MIN_HITS, share: dialect.SHARE, terms: rows });
});

const flag = asyncHandler(async (req, res) => {
  const term = dialect.stem(dialect.normalizeArabic(req.params.term || '').split(' ')[0] || '');
  const status = req.body?.status;
  if (!term || term.length < 2 || term.length > 40 || !['approved', 'blocked', 'clear'].includes(status)) return error(res, req.t('invalid_data'), 400);
  let categoryId = null, serviceId = null;
  if (status === 'approved' && req.body.category_id != null && req.body.category_id !== '') {
    categoryId = Number(req.body.category_id);
    if (!Number.isSafeInteger(categoryId) || !await queryOne('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', [categoryId])) return error(res, req.t('invalid_data'), 400);
    if (req.body.service_id != null && req.body.service_id !== '') {
      serviceId = Number(req.body.service_id);
      if (!Number.isSafeInteger(serviceId) || !await queryOne('SELECT id FROM services WHERE id = ? AND category_id = ? AND deleted_at IS NULL', [serviceId, categoryId])) return error(res, req.t('invalid_data'), 400);
    }
  }
  await dialect.setFlag(term, status, { categoryId, serviceId, userId: req.user.id });
  await query(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'admin.dialect.term', 'dialect_term', NULL, ?)`,
    [req.user.id, `${status}: ${term}${categoryId ? ` → ${categoryId}` : ''}`]).catch(() => {});
  return success(res, (await dialect.allTerms()).find(row => row.term === term) || { term, status });
});

module.exports = { list, flag };
