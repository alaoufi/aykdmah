// Country of an IP address for the admin security report (AYK-242), looked up locally in the free
// DB-IP "IP to Country Lite" database (CC BY 4.0: the report credits "IP Geolocation by DB-IP").
// Addresses are never sent to anyone: the database file is downloaded once a month and read here.
// Any failure only leaves the country empty.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Reader } = require('mmdb-lib');
const logger = require('../utils/logger');

let reader = null;
let loadedMonth = null;
let loading = null;
let failedAt = 0;

const month = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

async function download(target) {
  for (const m of [month(), month(-1)]) {
    const response = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${m}.mmdb.gz`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) continue;
    const buffer = zlib.gunzipSync(Buffer.from(await response.arrayBuffer()));
    fs.writeFileSync(target, buffer);
    return buffer;
  }
  throw new Error('geoip database not available');
}

async function load() {
  const fixed = process.env.GEOIP_DB_PATH;
  if (fixed) {
    if (!reader) reader = new Reader(fs.readFileSync(fixed));
    return reader;
  }
  if (reader && loadedMonth === month()) return reader;
  if (Date.now() - failedAt < 60 * 60 * 1000) return reader; // retry a failed download hourly
  loading = loading || (async () => {
    const file = path.join(os.tmpdir(), `dbip-country-${month()}.mmdb`);
    try {
      const buffer = fs.existsSync(file) ? fs.readFileSync(file) : await download(file);
      reader = new Reader(buffer);
      loadedMonth = month();
    } catch (err) {
      failedAt = Date.now();
      logger.warn('GeoIP database unavailable', { message: err.message });
    }
  })().finally(() => { loading = null; });
  await loading;
  return reader;
}

const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd]|fe80)/i;

// { ip: 'SA', ... } for the given addresses; unknown, private or invalid ones are left out.
async function countries(ips) {
  const result = {};
  if (process.env.GEOIP_DISABLE === '1') return result;
  const db = await load().catch(() => null);
  if (!db) return result;
  for (const raw of new Set(ips)) {
    const ip = String(raw || '').replace(/^::ffff:/, '');
    if (!ip || PRIVATE.test(ip)) continue;
    try {
      const code = db.get(ip)?.country?.iso_code;
      if (code) result[raw] = code;
    } catch (_) { /* not an address */ }
  }
  return result;
}

module.exports = { countries };
