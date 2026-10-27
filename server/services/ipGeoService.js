// Resolves a visitor's IP address to a coarse geo location
// ({ country, country_name, region, city, latitude, longitude }).
//
// Strategy:
//   1. Logged-in users with city_id are NOT looked up here — callers
//      use their stored city directly.
//   2. For anonymous visitors, hit ip-api.com (free, 45 req/min, no
//      key). Results are cached in ip_geo_cache for `ads_geo_cache_days`
//      so we don't repeat the call.
//   3. Localhost / private IPs return null so the caller can skip
//      geo filtering during dev.

const { query, queryOne } = require('../config/database');
const Setting = require('../models/Setting');
const net = require('net');
const nominatim = require('./nominatimClient');

const PRIVATE_RANGES = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/, /^fc/, /^fd/, /^fe80:/i,
];

function isPrivate(ip) {
  if (!ip) return true;
  const stripped = String(ip).replace(/^::ffff:/, '');
  if (!net.isIP(stripped)) return true;
  return PRIVATE_RANGES.some((re) => re.test(stripped));
}

// Pulls the first non-private IP from Express's req. Supports
// X-Forwarded-For chains (Vercel, Cloudflare, nginx, …).
function ipFromRequest(req) {
  // Express resolves the peer using the explicitly configured proxy policy.
  const real = req.ip || req.socket?.remoteAddress;
  if (real && !isPrivate(real)) return String(real).replace(/^::ffff:/, '');
  return null;
}

async function readCache(ip, ttlDays) {
  const row = await queryOne(
    `SELECT * FROM ip_geo_cache
       WHERE ip = ? AND resolved_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
       LIMIT 1`,
    [ip, ttlDays]
  );
  return row;
}

async function writeCache(ip, geo) {
  await query(
    `INSERT INTO ip_geo_cache (ip, country, country_name, region, region_id, city, latitude, longitude, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (ip) DO UPDATE SET
       country = EXCLUDED.country, country_name = EXCLUDED.country_name,
       region = EXCLUDED.region, region_id = EXCLUDED.region_id,
       city = EXCLUDED.city,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
       provider = EXCLUDED.provider, resolved_at = CURRENT_TIMESTAMP`,
    [ip, geo.country || null, geo.country_name || null, geo.region || null,
     geo.region_id || null,
     geo.city || null, geo.latitude || null, geo.longitude || null, geo.provider || 'ip-api']
  );
}

// Map a free-text region label (what ip-api returns, e.g. "Riyadh
// Region", "Makkah Region") to an actual regions.id we can compare
// against ad.target_regions. Fuzzy-matches name_en, name_ar, and a
// few common short forms. Region labels can repeat across countries, so only
// one active match inside the reported country is safe to use for targeting.
const REGION_ID_CACHE = new Map();
async function resolveRegionId(label, country) {
  const name = typeof label === 'string' ? label.trim().toLowerCase() : '';
  const code = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (!name || !/^[A-Z]{2}$/.test(code)) return null;
  const key = `${code}:${name}`;
  if (REGION_ID_CACHE.has(key)) return REGION_ID_CACHE.get(key);
  // Share concurrent work only. Persisting an ID would hide later administrator
  // changes to country/region availability or make a newly ambiguous name stick.
  const pending = matchRegionId(name, code);
  REGION_ID_CACHE.set(key, pending);
  try { return await pending; }
  finally { if (REGION_ID_CACHE.get(key) === pending) REGION_ID_CACHE.delete(key); }
}

async function matchRegionId(name, code) {
  // Direct match first, then a literal substring match for common suffixes.
  let rows = await query(
    `SELECT r.id FROM regions r JOIN countries c ON c.id = r.country_id
       WHERE c.code = ? AND c.is_active = 1 AND r.is_active = 1
         AND (LOWER(r.name_en) = ? OR LOWER(r.name_ar) = ?)`,
    [code, name, name]
  );
  if (rows.length === 0) {
    // Strip suffixes like " region" / " province" before LIKE.
    const stripped = name.replace(/\b(region|province|governorate|state|emirate)\b/gi, '').trim();
    if (stripped) {
      const pattern = `%${stripped.replace(/[\\%_]/g, '\\$&')}%`;
      rows = await query(
        `SELECT r.id FROM regions r JOIN countries c ON c.id = r.country_id
           WHERE c.code = ? AND c.is_active = 1 AND r.is_active = 1
             AND (LOWER(r.name_en) LIKE ? OR LOWER(r.name_ar) LIKE ?)`,
        [code, pattern, pattern]
      );
    }
  }
  return rows.length === 1 ? rows[0].id : null;
}

async function fetchFromIpApi(ip) {
  // ip-api.com — no auth, 45 req/min/IP, HTTPS available on the
  // paid tier. Node 18+ ships a global fetch().
  try {
    const url = `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,lat,lon`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 'success') return null;
    return {
      country: j.countryCode || null,
      country_name: j.country || null,
      region: j.regionName || null,
      city: j.city || null,
      latitude: j.lat || null,
      longitude: j.lon || null,
      provider: 'ip-api',
    };
  } catch (_) {
    return null;
  }
}

// Reverse-geocode lat/lon to { country, region, city, district } using
// OpenStreetMap's Nominatim. Free, no API key. Required courtesy:
// a real User-Agent header identifying the app.
async function reverseGeocode({ lat, lon }) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  try {
    // zoom=18 gives the finest level (street/building) so we can
    // pull the neighbourhood / suburb for the district match. The
    // address object scales up: city/state are still included.
    // Rounded to ~1 m so nearby taps share the cache; queued to respect the usage policy.
    const j = await nominatim.request('/reverse', {
      zoom: 18, addressdetails: 1, 'accept-language': 'ar,en', lat: lat.toFixed(5), lon: lon.toFixed(5),
    });
    if (!j) return null;
    const a = j.address || {};
    const country = (a.country_code || '').toUpperCase();
    if (!country) return null;
    // Address fields cascade from large to small. Pick the right
    // level for each of our admin tiers.
    const region      = a.state || a.region || a.province || null;
    const governorate = a.governorate || a.county || a.state_district || null;
    const city        = a.city || a.town || a.village || a.municipality || null;
    // Districts in Arabic cities usually surface as 'suburb',
    // 'neighbourhood', or 'quarter' — try them in that order.
    const district    = a.suburb || a.neighbourhood || a.quarter || a.residential || null;
    return {
      country,
      country_name: a.country || null,
      region,
      governorate,
      city,
      district,
      latitude: Number(lat),
      longitude: Number(lon),
      provider: 'nominatim',
    };
  } catch (_) { return null; }
}

async function lookup(ip) {
  if (!ip || isPrivate(ip)) return null;
  const [provider, ttl] = await Promise.all([
    Setting.get('ads_geo_provider', 'ip-api').catch(() => 'ip-api'),
    Setting.get('ads_geo_cache_days', 14).catch(() => 14),
  ]);
  if (provider === 'disabled') return null;

  const cached = await readCache(ip, Number(ttl) || 14).catch(() => null);
  if (cached) {
    // Older cache entries may carry a region ID resolved without country scope.
    cached.region_id = await resolveRegionId(cached.region, cached.country).catch(() => null);
    return cached;
  }

  const fresh = await fetchFromIpApi(ip);
  if (fresh) {
    fresh.region_id = await resolveRegionId(fresh.region, fresh.country).catch(() => null);
    writeCache(ip, fresh).catch(() => { /* cache best-effort */ });
    return fresh;
  }
  return null;
}

// Highest-level helper used by the ad serving path. Prefers logged-in
// user's saved city (attached directly to a region or through a governorate)
// over IP lookup.
async function resolveVisitorGeo(req) {
  if (req.user?.id) {
    const u = await queryOne(
      `SELECT u.city_id, c.name_ar AS city_name,
              COALESCE(c.region_id, g.region_id) AS region_id,
              r.name_ar AS region_name, r.name_en AS region_name_en,
              country.code AS country, country.name_en AS country_name
         FROM users u
         LEFT JOIN cities c       ON c.id = u.city_id AND c.is_active = 1
         LEFT JOIN governorates g ON g.id = c.governorate_id AND g.is_active = 1
         LEFT JOIN regions r      ON r.id = COALESCE(c.region_id, g.region_id) AND r.is_active = 1
         LEFT JOIN countries country ON country.id = r.country_id AND country.is_active = 1
         WHERE u.id = ?
           AND (c.governorate_id IS NULL OR (g.id IS NOT NULL AND g.region_id = r.id))`,
      [req.user.id]
    );
    if (u?.country && (u?.city_name || u?.region_name)) {
      return {
        city: u.city_name || null,
        region: u.region_name || u.region_name_en || null,
        region_id: u.region_id || null,
        country: u.country,
        country_name: u.country_name || null,
        source: 'user_profile',
      };
    }
  }
  const ip = ipFromRequest(req);
  const geo = await lookup(ip);
  if (geo) return { ...geo, source: 'ip' };
  return null;
}

module.exports = { isPrivate, ipFromRequest, lookup, resolveVisitorGeo, reverseGeocode };
