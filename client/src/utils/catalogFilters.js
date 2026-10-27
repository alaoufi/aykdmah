import { tx } from './localize.js';

export const CATALOG_FILTER_KEYS = ['q', 'region', 'governorate', 'city', 'district', 'sort'];
export const CATALOG_SORTS = ['default', 'name_asc', 'name_desc'];
export const LAST_CATALOG_SEARCH = 'ryza_catalog_search_v1';
const LOCATION_KEYS = ['region', 'governorate', 'city', 'district'];

export function readCatalogFilters(params) {
  const filters = Object.fromEntries(CATALOG_FILTER_KEYS.map(key => [key, params.get(key) || '']));
  filters.sort = CATALOG_SORTS.includes(filters.sort) ? filters.sort : 'default';
  return filters;
}

// Keep only public discovery context, never auth tokens or arbitrary URL fields.
export function catalogQuery(params) {
  const query = new URLSearchParams();
  for (const key of CATALOG_FILTER_KEYS) {
    const value = params.get(key);
    if (value && !(key === 'sort' && value === 'default')) query.set(key, value);
  }
  return query.toString();
}

export function changeCatalogParams(params, patch) {
  const next = new URLSearchParams(catalogQuery(params));
  const changed = Object.keys(patch);
  if (changed.includes('region')) ['governorate', 'city', 'district'].forEach(key => next.delete(key));
  else if (changed.includes('governorate')) ['city', 'district'].forEach(key => next.delete(key));
  else if (changed.includes('city')) next.delete('district');
  for (const [key, value] of Object.entries(patch)) {
    if (!CATALOG_FILTER_KEYS.includes(key)) continue;
    if (value && !(key === 'sort' && value === 'default')) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

export function normalizeSearch(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ').trim();
}

function textValues(value) {
  return typeof value === 'object' && value ? Object.values(value) : [value];
}
export function filterCatalogServices(services, categories, filters, lang = 'ar', locationAvailable = true) {
  if (!locationAvailable) return [];
  const tokens = normalizeSearch(filters.q).split(' ').filter(Boolean);
  const results = services.filter(service => {
    const category = categories.find(row => row.id === service.categoryId);
    const haystack = normalizeSearch([
      ...textValues(service.title), ...textValues(service.desc), service.categorySlug,
      ...textValues(category?.name), ...textValues(category?.desc), ...(service.searchTerms || []),
    ].filter(Boolean).join(' '));
    return tokens.every(token => haystack.includes(token));
  });
  if (!['name_asc', 'name_desc'].includes(filters.sort)) return results;
  const direction = filters.sort === 'name_desc' ? -1 : 1;
  const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
  return [...results].sort((a, b) => direction * collator.compare(tx(a.title, lang), tx(b.title, lang)) || a.id - b.id);
}

export const findLocationRow = (rows, id) => rows.find(row => String(row.id) === String(id));
const validId = value => /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value));

// Launch scope is service-type coverage, not a claim that a provider serves
// every district. Active API records remain the source of selector IDs.
export function isLaunchCity(city) {
  return Number(city.region_id) === 4 ||
    (Number(city.governorate_id) === 5 && normalizeSearch(city.name_ar) === 'المجمعة');
}

export function validateCatalogLocation(filters, { regions, cities, governorates, districts }) {
  if (LOCATION_KEYS.some(key => filters[key] && !validId(filters[key]))) return false;
  const launchCities = cities.filter(isLaunchCity);
  const region = filters.region && findLocationRow(regions, filters.region);
  const city = filters.city && findLocationRow(launchCities, filters.city);
  const governorate = filters.governorate && findLocationRow(governorates, filters.governorate);
  if (filters.region && (!region || !launchCities.some(row => String(row.region_id) === filters.region))) return false;
  if (filters.governorate && (!governorate || !launchCities.some(row => String(row.governorate_id) === filters.governorate))) return false;
  if (region && governorate && String(governorate.region_id) !== String(region.id)) return false;
  if (filters.city && (!city || !findLocationRow(regions, city.region_id))) return false;
  if (city?.governorate_id && !findLocationRow(governorates, city.governorate_id)) return false;
  if (city && region && String(city.region_id) !== String(region.id)) return false;
  if (city && governorate && String(city.governorate_id) !== String(governorate.id)) return false;
  if (filters.district && (!city || !findLocationRow(districts, filters.district))) return false;
  const district = filters.district && findLocationRow(districts, filters.district);
  if (district && String(district.city_id) !== String(city.id)) return false;
  return true;
}

export function rememberCatalogSearch(params, storage = globalThis.sessionStorage) {
  try { storage?.setItem(LAST_CATALOG_SEARCH, catalogQuery(params)); } catch (_) {}
}
export function readRememberedCatalogSearch(storage = globalThis.sessionStorage) {
  try { return new URLSearchParams(storage?.getItem(LAST_CATALOG_SEARCH) || ''); }
  catch (_) { return new URLSearchParams(); }
}
