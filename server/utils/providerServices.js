const { query } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const empty = value => value === null || value === undefined || value === '';
const validId = value => ['number', 'string'].includes(typeof value)
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;

// Provider services must belong to one active profession. The same rules are
// used at registration and profile editing; legacy profiles remain editable.
async function validateProviderServices(input, existing = {}, { required = false, message = 'Invalid provider services' } = {}) {
  const hasCategory = has(input, 'category_id');
  const hasServices = has(input, 'service_ids');
  if (!hasCategory && !hasServices && !required) return {};

  const value = hasCategory ? input.category_id : existing.category_id;
  if (!empty(value) && !validId(value)) throw new ApiError(message, 400);
  const categoryId = empty(value) ? null : Number(value);
  if (required && !categoryId) throw new ApiError(message, 400);
  if (categoryId && !(await query('SELECT id FROM categories WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [categoryId])).length) {
    throw new ApiError(message, 400);
  }

  const changed = hasCategory && categoryId !== (existing.category_id == null ? null : Number(existing.category_id));
  const ids = hasServices ? input.service_ids : changed ? [] : existing.service_ids ?? [];
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !validId(id))) throw new ApiError(message, 400);
  const services = [...new Set(ids.map(Number))];
  if ((required && !services.length) || (services.length && !categoryId)) throw new ApiError(message, 400);
  if (services.length) {
    const rows = await query(`SELECT id FROM services WHERE id IN (${services.map(() => '?').join(', ')})
      AND category_id = ? AND is_active = 1 AND deleted_at IS NULL`, [...services, categoryId]);
    if (rows.length !== services.length) throw new ApiError(message, 400);
  }
  return { ...(hasCategory || required ? { category_id: categoryId } : {}), service_ids: services };
}

async function validateServiceList(ids, { required = false, message = 'Invalid provider services' } = {}) {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => !validId(id))) throw new ApiError(message, 400);
  const services = [...new Set(ids.map(Number))];
  if (required && !services.length) throw new ApiError(message, 400);
  if (!services.length) return { category_id: null, service_ids: [] };
  const rows = await query(`SELECT s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id
    WHERE s.id IN (${services.map(() => '?').join(', ')}) AND s.is_active = 1 AND s.deleted_at IS NULL
      AND c.is_active = 1 AND c.deleted_at IS NULL`, services);
  if (rows.length !== services.length) throw new ApiError(message, 400);
  const first = rows.find(row => Number(row.id) === services[0]);
  return { category_id: Number(first.category_id), service_ids: services };
}

module.exports = { validateProviderServices, validateServiceList };
