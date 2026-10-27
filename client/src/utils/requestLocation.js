import { isValidCoordinates, preserveCoordinatesForAreaChange } from './geolocation.mjs';

export const REQUEST_LOCATION_LEVELS = ['country_id', 'region_id', 'governorate_id', 'city_id', 'district_id'];
export const emptyRequestLocation = () => ({
  country_id: '', region_id: '', governorate_id: '', city_id: '', district_id: '',
  address: '', latitude: null, longitude: null,
});
export function locationId(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) return '';
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? String(id) : '';
}
export const activeLocationRow = row => Boolean(row) && ![false, 0, '0'].includes(row.is_active);
export const findLocation = (rows, id) => (rows || []).find(row => activeLocationRow(row) && locationId(row.id) === locationId(id) && locationId(id));
export function locationPoint(location) {
  const coordinate = value => value == null || String(value).trim() === '' ? NaN : Number(value);
  const latitude = coordinate(location?.latitude), longitude = coordinate(location?.longitude);
  return isValidCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

// Only active, coherent geography can fill a request. City-center coordinates
// are viewing aids and are deliberately absent from this location snapshot.
export function requestCityLocation(id, catalog) {
  const city = findLocation(catalog?.cities, id);
  if (!city) return null;
  const governorate = city.governorate_id ? findLocation(catalog?.governorates, city.governorate_id) : null;
  if (city.governorate_id && !governorate) return null;
  if (city.region_id && governorate && locationId(city.region_id) !== locationId(governorate.region_id)) return null;
  const region = findLocation(catalog?.regions, city.region_id || governorate?.region_id);
  const country = region && findLocation(catalog?.countries, region.country_id);
  if (!region || !country) return null;
  return {
    ...emptyRequestLocation(), country_id: locationId(country.id), region_id: locationId(region.id),
    governorate_id: locationId(governorate?.id), city_id: locationId(city.id),
  };
}

export function savedRequestLocation(user, catalog) {
  const location = requestCityLocation(user?.city_id, catalog);
  if (!location) return null;
  for (const key of ['country_id', 'region_id', 'governorate_id']) {
    if (user?.[key] != null && String(user[key]) !== '' && locationId(user[key]) !== location[key]) return null;
  }
  return {
    ...location, district_id: locationId(user?.district_id),
    address: typeof user?.address === 'string' ? user.address.slice(0, 500) : '',
    ...(locationPoint(user) || {}),
  };
}

// Explicit browsing context wins. Account address and pin only carry across
// when the requested area still contains that same saved neighborhood.
export function initialRequestLocation({ user, params, catalog, fallbackCountryId }) {
  const saved = savedRequestLocation(user, catalog);
  const requestedCity = locationId(params?.get?.('city') || params?.get?.('city_id'));
  const requestedDistrict = locationId(params?.get?.('district') || params?.get?.('district_id'));
  const selected = requestCityLocation(requestedCity, catalog);
  const parentMatches = selected && ['region', 'governorate'].every(key => {
    const value = params?.get?.(key) || params?.get?.(`${key}_id`);
    return !value || locationId(value) === selected[`${key}_id`];
  });
  if (selected && parentMatches) {
    const sameArea = saved && selected.city_id === saved.city_id && (!requestedDistrict || requestedDistrict === saved.district_id);
    return {
      source: 'query',
      location: { ...(sameArea ? saved : selected), district_id: requestedDistrict || (sameArea ? saved.district_id : '') },
    };
  }
  if (saved) return { source: 'saved', location: saved };
  const country = findLocation(catalog?.countries, user?.country_id || fallbackCountryId) || catalog?.countries?.find(activeLocationRow);
  return { source: 'empty', location: { ...emptyRequestLocation(), country_id: locationId(country?.id) } };
}

export function changeRequestLocation(location, key, value, catalog, { preserveFreshPoint = false } = {}) {
  if (key === 'address') {
    if (value === location.address) return location;
    return { ...location, address: value, ...(preserveFreshPoint ? {} : { latitude: null, longitude: null }) };
  }
  const selectedId = locationId(value);
  if (location[key] === selectedId) return location;
  const level = REQUEST_LOCATION_LEVELS.indexOf(key);
  if (level < 0) return location;
  let changes = {
    [key]: selectedId,
    ...Object.fromEntries(REQUEST_LOCATION_LEVELS.slice(level + 1).map(child => [child, ''])),
  };
  if (key === 'city_id' && selectedId) {
    const selected = requestCityLocation(selectedId, catalog);
    if (!selected) return location;
    changes = Object.fromEntries(REQUEST_LOCATION_LEVELS.map(field => [field, selected[field]]));
  }
  const preservePoint = preserveFreshPoint && preserveCoordinatesForAreaChange(location, changes);
  const replacesArea = Object.entries(changes).some(([field, next]) => location[field] && location[field] !== next);
  return {
    ...location, ...changes,
    ...(preservePoint ? {} : { latitude: null, longitude: null }),
    ...(replacesArea ? { address: '' } : {}),
  };
}

export function validateRequestDistrict(location, districts) {
  if (!location.district_id) return location;
  const district = findLocation(districts, location.district_id);
  if (district && locationId(district.city_id) === location.city_id) return location;
  return { ...location, district_id: '', address: '', latitude: null, longitude: null };
}
export function completeRequestLocation(location, districts, ready = true) {
  return Boolean(ready && location.city_id && (!districts.length || locationId(findLocation(districts, location.district_id)?.city_id) === location.city_id)
    && typeof location.address === 'string' && location.address.trim() && locationPoint(location));
}
export function requestLocationFields(location, remember = false) {
  const fields = { ...Object.fromEntries(REQUEST_LOCATION_LEVELS.map(key => [key, locationId(location?.[key]) || null])), address: String(location?.address || '').trim() || null };
  const point = locationPoint(location);
  return { ...fields, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, remember_location: Boolean(remember) };
}

// Blank location fields mean an intentional clear. Omitting them could cause
// an older server to fall back to the saved home address or coordinates.
export function appendRequestLocation(formData, snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => formData.append(key, value == null ? '' : String(value)));
  return formData;
}
