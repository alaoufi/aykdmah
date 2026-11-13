const { queryOne, tableHasColumn } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

const LEVELS = ['country_id', 'region_id', 'governorate_id', 'city_id', 'district_id'];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const empty = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

function locationId(value, message) {
  if (empty(value)) return null;
  if (!['number', 'string'].includes(typeof value)) throw new ApiError(message, 400);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new ApiError(message, 400);
  return id;
}

function accountAddress(value, message = 'Invalid location') {
  if (empty(value)) return null;
  if (typeof value !== 'string' || value.length > 500 || value.includes('\0')) throw new ApiError(message, 400);
  return value.trim() || null;
}

function booleanIntent(value, message = 'Invalid data') {
  if (value === undefined || value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  throw new ApiError(message, 400);
}

function locationChanged(location, existing = {}) {
  return [...LEVELS, 'latitude', 'longitude', 'address'].some(key => {
    if (!has(location, key) || location[key] === undefined) return false;
    if (key === 'address') return (location[key] || null) !== (typeof existing[key] === 'string' ? existing[key].trim() || null : null);
    if (empty(location[key]) || empty(existing[key])) return empty(location[key]) !== empty(existing[key]);
    return Number(location[key]) !== Number(existing[key]);
  });
}

// Completeness never supplies city-centre coordinates or an invented address.
// A saved point must be supplied by the customer, and optional districts are
// required only when the selected city actually has active neighbourhoods.
async function requireCompleteLocation(location, message = 'account_location_required', database = {}) {
  if (!locationId(location.city_id, message) || !accountAddress(location.address, message) ||
      [location.latitude, location.longitude].some(empty) ||
      ![location.latitude, location.longitude].every(value => ['number', 'string'].includes(typeof value) && Number.isFinite(Number(value))) ||
      Math.abs(Number(location.latitude)) > 90 || Math.abs(Number(location.longitude)) > 180) throw new ApiError(message, 400);
  // Validate the entire active hierarchy, including inherited ancestors.
  await validateUserLocation(Object.fromEntries(LEVELS.map(key => [key, location[key]])), {}, message, database);
  const read = database.queryOne || queryOne;
  if (!location.district_id && await read('SELECT id FROM districts WHERE city_id = ? AND is_active = 1 LIMIT 1', [location.city_id])) throw new ApiError(message, 400);
}

async function requireCompleteAccountProfile(user, message = 'account_profile_required', { confirmed = false } = {}) {
  if (typeof user.full_name !== 'string' || user.full_name.trim().length < 2 || user.full_name.length > 150 ||
      typeof user.phone !== 'string' || !/^\+?\d{8,15}$/.test(user.phone.replace(/[\s()-]/g, '')) ||
      (confirmed && user.location_confirmed !== true && user.location_confirmed !== 'true')) throw new ApiError(message, 400);
  await requireCompleteLocation(user, message);
}

async function isCompleteAccountProfile(user) {
  try { await requireCompleteAccountProfile(user); return true; }
  catch (error) { if (error instanceof ApiError) return false; throw error; }
}

// Every ID comes from the application's active geography. Source IDs and
// inconsistent parent/child combinations must never reach user records.
async function validateUserLocation(input, existing = {}, message = 'Invalid location', database = {}) {
  const read = database.queryOne || queryOne;
  const hasColumn = database.tableHasColumn || tableHasColumn;
  const changedLevels = LEVELS.filter(key => has(input, key));
  const hasCoordinates = has(input, 'latitude') || has(input, 'longitude');
  const hasAddress = has(input, 'address');
  if (!changedLevels.length && !hasCoordinates && !hasAddress) return {};

  const values = {};
  for (const key of LEVELS) values[key] = locationId(has(input, key) ? input[key] : existing[key], message);
  const firstChanged = LEVELS.findIndex(key => has(input, key) && values[key] !== locationId(existing[key], message));
  if (firstChanged >= 0) {
    for (const key of LEVELS.slice(firstChanged + 1)) {
      if (!has(input, key)) values[key] = null;
    }
  }
  const active = async (table, id) => {
    if (!id) return null;
    const row = await read(`SELECT * FROM ${table} WHERE id = ? AND is_active = 1`, [id]);
    if (!row) throw new ApiError(message, 400);
    return row;
  };
  const derive = (key, id) => {
    const parent = locationId(id, message);
    // A supplied non-empty parent must agree with the selected child.
    if (has(input, key) && !empty(input[key]) && values[key] !== parent) throw new ApiError(message, 400);
    values[key] = parent;
  };

  if (changedLevels.length) {
    const district = await active('districts', values.district_id);
    if (district) derive('city_id', district.city_id);
    const city = await active('cities', values.city_id);
    if (city) {
      derive('governorate_id', city.governorate_id);
      if (city.region_id) derive('region_id', city.region_id);
    }
    const governorate = await active('governorates', values.governorate_id);
    if (governorate) derive('region_id', governorate.region_id);
    const region = await active('regions', values.region_id);
    if (region && region.country_id) derive('country_id', region.country_id);
    if (await hasColumn('countries', 'id')) await active('countries', values.country_id);
  }

  const out = changedLevels.length ? { ...values } : {};
  const areaChanged = LEVELS.some(key => changedLevels.includes(key) && values[key] !== locationId(existing[key], message));
  if (hasAddress) out.address = accountAddress(input.address, message);
  else if (areaChanged) out.address = null;
  const addressChanged = hasAddress && out.address !== (typeof existing.address === 'string' ? existing.address.trim() || null : null);
  if (hasCoordinates) {
    if ((areaChanged || addressChanged) && (!has(input, 'latitude') || !has(input, 'longitude'))) throw new ApiError(message, 400);
    const lat = has(input, 'latitude') ? input.latitude : existing.latitude;
    const lon = has(input, 'longitude') ? input.longitude : existing.longitude;
    if (empty(lat) !== empty(lon)) throw new ApiError(message, 400);
    if (empty(lat) && empty(lon)) {
      out.latitude = null; out.longitude = null;
    } else {
      if (![lat, lon].every(value => ['number', 'string'].includes(typeof value))) throw new ApiError(message, 400);
      const latitude = Number(lat), longitude = Number(lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new ApiError(message, 400);
      }
      out.latitude = latitude; out.longitude = longitude;
    }
  } else if (areaChanged || addressChanged) {
    out.latitude = null; out.longitude = null;
  }
  return out;
}

module.exports = {
  validateUserLocation, accountAddress, booleanIntent, locationChanged,
  requireCompleteLocation, requireCompleteAccountProfile, isCompleteAccountProfile,
};
