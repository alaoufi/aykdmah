const ipGeo = require('../services/ipGeoService');
const Country = require('../models/Country');
const { query } = require('../config/database');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[’'`]/g, '').replace(/[-.,]/g, ' ')
    .replace(/^(?:منطقة|محافظة|مدينة|حي)\s+/u, '')
    .replace(/\b(?:region|province|governorate|district|dist)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function matchName(rows, label) {
  const name = normalizeName(label);
  if (!name) return null;
  const matched = rows.filter(row => [row.name_ar, row.name_en].some(value => normalizeName(value) === name));
  // Ambiguous names must remain manual; never choose the first database row.
  return matched.length === 1 ? matched[0] : null;
}

function distanceKm(lat, lon, row) {
  if (row.latitude == null || row.longitude == null) return Infinity;
  const cityLat = Number(row.latitude), cityLon = Number(row.longitude);
  if (!Number.isFinite(cityLat) || !Number.isFinite(cityLon)) return Infinity;
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(cityLat - lat), deltaLon = radians(cityLon - lon);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(cityLat)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Only the immediate vicinity of a real launch-city center qualifies. This is
// an approximate city hint, never a district lookup or a replacement GPS pair.
function nearbyLaunchCity(cities, lat, lon) {
  const ranked = cities.filter(city => Number(city.region_id) === 4 || Number(city.governorate_id) === 5)
    .map(city => ({ city, km: distanceKm(lat, lon, city) })).sort((a, b) => a.km - b.km);
  if (!ranked[0] || ranked[0].km > 6) return null;
  if (ranked[1] && (ranked[1].km - ranked[0].km < 3 || ranked[1].km < ranked[0].km * 1.5)) return null;
  return ranked[0].city;
}

async function hierarchy(country) {
  const regions = await query('SELECT id, country_id, name_ar, name_en FROM regions WHERE country_id = ? AND is_active = 1', [country.id]);
  const governorates = await query(
    `SELECT g.id, g.region_id, g.name_ar, g.name_en FROM governorates g
       JOIN regions r ON r.id = g.region_id
      WHERE r.country_id = ? AND r.is_active = 1 AND g.is_active = 1`, [country.id],
  );
  const cities = await query(
    `SELECT c.id, c.name_ar, c.name_en, c.latitude, c.longitude, c.governorate_id,
            COALESCE(c.region_id, g.region_id) AS region_id
       FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id
       JOIN regions r ON r.id = COALESCE(c.region_id, g.region_id)
      WHERE r.country_id = ? AND r.is_active = 1 AND c.is_active = 1
        AND (c.governorate_id IS NULL OR (g.is_active = 1 AND g.region_id = r.id))`, [country.id],
  );
  return { regions, governorates, cities };
}

// GET /api/geo/reverse: a pin is never resolved using the visitor's IP address.
const reverse = asyncHandler(async (req, res) => {
  const rawLat = req.query.lat, rawLon = req.query.lon;
  const lat = Number(rawLat), lon = Number(rawLon);
  if (rawLat == null || rawLon == null || !String(rawLat).trim() || !String(rawLon).trim() ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return error(res, 'Valid latitude and longitude required', 400);
  }

  const geo = await ipGeo.reverseGeocode({ lat, lon });
  let country = geo?.country ? await Country.findByCode(geo.country) : null;
  if (country && Number(country.is_active) !== 1) country = null;
  let region = null, governorate = null, city = null, district = null;
  let rows = null, bestEffort = false;
  if (country) {
    rows = await hierarchy(country);
    region = matchName(rows.regions, geo?.region);
    governorate = matchName(rows.governorates.filter(row => !region || Number(row.region_id) === Number(region.id)), geo?.governorate);
    city = matchName(rows.cities.filter(row => (!region || Number(row.region_id) === Number(region.id)) &&
      (!governorate || Number(row.governorate_id) === Number(governorate.id))), geo?.city);
  }

  // Recover a local city hint when the address provider is unavailable or does
  // not know our city label. Do not infer Saudi Arabia for distant coordinates.
  if (!city && (!geo?.country || String(geo.country).toUpperCase() === 'SA')) {
    const sa = country || await Country.findByCode('SA');
    if (sa && Number(sa.is_active) === 1) {
      const saRows = rows || await hierarchy(sa);
      const nearby = nearbyLaunchCity(saRows.cities, lat, lon);
      if (nearby) { country = sa; rows = saRows; city = nearby; bestEffort = true; }
    }
  }

  if (city) {
    // The selected city's actual parents override provider labels so the form
    // always receives IDs that belong to the same hierarchy, including cities
    // which are attached directly to a region.
    region = rows.regions.find(row => Number(row.id) === Number(city.region_id)) || null;
    governorate = rows.governorates.find(row => Number(row.id) === Number(city.governorate_id)) || null;
    if (!bestEffort && geo?.district) {
      const districts = await query('SELECT id, city_id, name_ar, name_en FROM districts WHERE city_id = ? AND is_active = 1', [city.id]);
      district = matchName(districts, geo.district);
    }
  } else if (governorate) {
    region = rows.regions.find(row => Number(row.id) === Number(governorate.region_id)) || null;
  }

  return success(res, {
    matched: !!country, best_effort: bestEffort,
    latitude: lat, longitude: lon,
    raw: geo || null, provider: bestEffort ? 'local-city-center' : geo?.provider || null,
    country: country ? {
      id: country.id, code: country.code,
      name_ar: country.name_ar, name_en: country.name_en,
      flag_emoji: country.flag_emoji, dial_code: country.dial_code,
      currency_code: country.currency_code, currency_symbol: country.currency_symbol,
      languages_enabled: country.languages_enabled,
    } : null,
    region, governorate,
    city: city ? { id: city.id, name_ar: city.name_ar, name_en: city.name_en,
      region_id: city.region_id, governorate_id: city.governorate_id } : null,
    district,
  });
});

module.exports = { reverse };
