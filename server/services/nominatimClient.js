// Shared access to OpenStreetMap Nominatim. Its usage policy requires an identifying
// User-Agent, at most one request per second and caching of results, so every call
// goes through this queue. NOMINATIM_URL can point at a self-hosted instance later.
const env = require('../config/env');

const BASE_URL = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const USER_AGENT = `AyKhidma/1.0 (${env.APP_URL})`;
const MIN_INTERVAL_MS = Number(process.env.NOMINATIM_MIN_INTERVAL_MS || 1100);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
const MAX_QUEUE = 20;

const cache = new Map();
let chain = Promise.resolve();
let lastRequestAt = 0;
let queued = 0;

function cached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.value;
}

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

// Resolves to parsed JSON, or null when the service is unavailable or busy.
function request(path, params) {
  const url = `${BASE_URL}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`;
  const hit = cached(url);
  if (hit !== undefined) return Promise.resolve(hit);
  if (queued >= MAX_QUEUE) return Promise.resolve(null);
  queued += 1;
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        redirect: 'error',
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ar,en;q=0.8' },
      });
      if (!res.ok) return null;
      const value = await res.json();
      remember(url, value);
      return value;
    } catch (_) { return null; }
  }).finally(() => { queued -= 1; });
  chain = run.catch(() => {});
  return run;
}

module.exports = { request, USER_AGENT };
