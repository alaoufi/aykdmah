const { ApiError } = require('../middleware/errorHandler');
const { validateUserLocation, booleanIntent, requireCompleteLocation } = require('./userLocation');

const LOCATION_FIELDS = ['country_id', 'region_id', 'governorate_id', 'city_id', 'district_id', 'address', 'latitude', 'longitude'];

// Missing fields reuse the saved account snapshot. Explicit nulls are retained,
// and moving the address or area cannot borrow coordinates from the old home.
async function resolveRequestLocation(input, account, database) {
  const changes = Object.fromEntries(LOCATION_FIELDS.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
  if ((changes.latitude !== undefined) !== (changes.longitude !== undefined)) throw new ApiError('invalid_coordinates', 422);
  try {
    const defaults = Object.fromEntries(LOCATION_FIELDS.map(key => [key, account[key] ?? null]));
    const validated = await validateUserLocation(changes, defaults, 'invalid_data', database);
    const location = await validateUserLocation({ ...defaults, ...validated }, {}, 'invalid_data', database);
    if (booleanIntent(input.remember_location, 'invalid_data')) {
      await requireCompleteLocation(location, 'account_location_required', database);
    }
    return location;
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) error.status = 422;
    throw error;
  }
}

module.exports = { resolveRequestLocation };
