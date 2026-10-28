const { ApiError } = require('../middleware/errorHandler');
const { queryOne } = require('../config/database');

const LANGUAGES = ['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const empty = value => value == null || (typeof value === 'string' && !value.trim());
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => { throw new ApiError('Invalid catalog data', 400); };

function text(value, max, required = false) {
  if (empty(value)) { if (required) invalid(); return null; }
  if (typeof value !== 'string' || value.includes('\0')) invalid();
  const result = value.trim();
  if ([...result].length > max) invalid();
  return result;
}

function number(value, min, max, { integer = false, nullable = false, fallback } = {}) {
  if (empty(value)) { if (nullable) return null; if (fallback !== undefined) return fallback; invalid(); }
  if (!['number', 'string'].includes(typeof value)) invalid();
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) invalid();
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isSafeInteger(result))) invalid();
  return result;
}

function catalogId(value, nullable = false) {
  return number(value, 1, 2147483647, { integer: true, nullable });
}

function flag(value) {
  if (![true, false, 0, 1, '0', '1'].includes(value)) invalid();
  return [true, 1, '1'].includes(value) ? 1 : 0;
}

function translations(value, max) {
  if (value == null) return null;
  if (!plain(value)) invalid();
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!LANGUAGES.includes(key) || typeof item !== 'string' || item.includes('\0') || [...item].length > max) invalid();
    out[key] = item.trim();
  }
  return out;
}

const sort = value => number(value, -2147483648, 2147483647, { integer: true, fallback: 0 });
const latitude = value => number(value, -90, 90, { nullable: true });
const longitude = value => number(value, -180, 180, { nullable: true });
const locationFields = { name_ar: value => text(value, 120, true), name_en: value => text(value, 120), latitude, longitude, is_active: flag };
const catalogFields = {
  name_ar: value => text(value, 150, true), name_en: value => text(value, 150),
  slug: value => text(value, 160, true), icon: value => text(value, 255),
  description: value => text(value, 20000), is_active: flag, sort_order: sort,
  name_translations: value => translations(value, 150), description_translations: value => translations(value, 20000),
};
const schemas = {
  category: { fields: { ...catalogFields, color: value => text(value, 20) }, required: ['name_ar'] },
  service: { fields: { ...catalogFields, category_id: catalogId, is_urgent_supported: flag, base_price: value => {
    const amount = number(value, 0, 99999999.99, { nullable: true });
    if (amount !== null && Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) invalid();
    return amount;
  } }, required: ['name_ar', 'category_id'] },
  region: { fields: { ...locationFields, sort_order: sort, country_id: value => catalogId(value, true),
    code: value => text(value, 20), capital_ar: value => text(value, 120), capital_en: value => text(value, 120) }, required: ['name_ar'] },
  governorate: { fields: { ...locationFields, sort_order: sort, region_id: catalogId, is_capital: flag }, required: ['name_ar', 'region_id'] },
  city: { fields: { ...locationFields, sort_order: sort, region_id: value => catalogId(value, true), governorate_id: value => catalogId(value, true) }, required: ['name_ar'] },
  district: { fields: { ...locationFields, city_id: catalogId }, required: ['name_ar', 'city_id'] },
  country: { fields: {
    name_ar: value => text(value, 80, true), name_en: value => text(value, 80, true),
    code: value => { const result = text(value, 2, true).toUpperCase(); if (!/^[A-Z]{2}$/.test(result)) invalid(); return result; },
    currency_code: value => { const result = text(value, 3, true).toUpperCase(); if (!/^[A-Z]{3}$/.test(result)) invalid(); return result; },
    flag_emoji: value => text(value, 8), dial_code: value => text(value, 8), currency_symbol: value => text(value, 16),
    sort_order: sort, is_active: flag, languages_enabled: value => {
      if (empty(value)) return null;
      if (!Array.isArray(value) || value.length > LANGUAGES.length || !value.every(item => LANGUAGES.includes(item))) invalid();
      return [...new Set(value)];
    },
  }, required: ['code', 'name_ar', 'name_en', 'currency_code'] },
};

function normalizeCatalog(kind, body, { create = false } = {}) {
  const schema = schemas[kind];
  if (!schema || !plain(body)) invalid();
  const data = {};
  for (const [key, parse] of Object.entries(schema.fields)) {
    if (own(body, key) && body[key] !== undefined) data[key] = parse(body[key]);
  }
  if (create && schema.required.some(key => !own(data, key) || data[key] === null)) invalid();
  return data;
}

async function validateCatalog(kind, body, { create = false, existing = {} } = {}) {
  const data = normalizeCatalog(kind, body, { create });
  const effective = { ...existing, ...data };
  const exists = async (table, id, extra = '') => {
    if (!id) return null;
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?${extra}`, [id]);
    if (!row) invalid();
    return row;
  };
  if (kind === 'service' && (create || own(data, 'category_id'))) await exists('categories', effective.category_id, ' AND deleted_at IS NULL');
  if (kind === 'region' && own(data, 'country_id')) await exists('countries', effective.country_id);
  if (kind === 'governorate' && (create || own(data, 'region_id'))) await exists('regions', effective.region_id);
  if (kind === 'district' && (create || own(data, 'city_id'))) await exists('cities', effective.city_id);
  if (kind === 'city' && (create || own(data, 'region_id') || own(data, 'governorate_id'))) {
    const governorate = await exists('governorates', effective.governorate_id);
    await exists('regions', effective.region_id);
    if (governorate && effective.region_id && Number(governorate.region_id) !== Number(effective.region_id)) invalid();
    if (governorate && !effective.region_id) data.region_id = governorate.region_id;
  }
  return data;
}

function reorderIds(body) {
  if (!plain(body) || !Array.isArray(body.ids) || body.ids.length > 1000) invalid();
  const ids = body.ids.map(value => catalogId(value));
  if (new Set(ids).size !== ids.length) invalid();
  return ids;
}

module.exports = { normalizeCatalog, validateCatalog, catalogId, reorderIds };
