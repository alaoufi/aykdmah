// AYK-251: the same public answer for a few seconds, however many people ask at once.
// When thousands open the app in the same instant they all ask for the settings, the categories
// and the countries. Each used to be its own database query through the 10 pooled connections.
// Here the first request runs; everyone arriving while it runs waits for THAT answer, and for
// `seconds` afterwards the stored answer is sent without touching the database.
// Only successful GET answers of the listed public paths, per language; never for an admin
// screen or a request asking for everything (?all=true); cleared whenever the admin area or the
// catalogue changes something, so an edit shows at once.
const cache = new Map(); // key -> { at, status, type, body } | { pending: Promise }
const MAX_ENTRIES = 500;

function microCache(seconds, paths) {
  const ttl = seconds * 1000;
  const exact = new Set(paths);
  return function microCacheMiddleware(req, res, next) {
    const path = req.baseUrl + req.path;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Only changes to what is stored here clear it (the admin area, the catalogue, the setup);
      // ordinary activity such as chat messages must not empty it all day long.
      if (cache.size && /^\/api\/(admin|categories|countries|setup|services)(\/|$)/.test(path)) cache.clear();
      return next();
    }
    if (!exact.has(path.replace(/\/$/, '')) || req.method !== 'GET') return next();
    if (req.query.all === 'true' || req.get('x-ayk-scope') === 'admin') return next();
    const key = `${req.lang || ''}|${req.originalUrl}`;
    const send = entry => {
      res.status(entry.status).set({ 'Content-Type': entry.type, 'X-Cache': 'hit' });
      return res.end(entry.body);
    };
    const hit = cache.get(key);
    if (hit && !hit.pending && Date.now() - hit.at < ttl) return send(hit);
    if (hit?.pending) return hit.pending.then(entry => (entry ? send(entry) : next()), () => next());
    let settle;
    const pending = new Promise(resolve => { settle = resolve; });
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, { pending });
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode === 200) {
        const entry = { at: Date.now(), status: 200, type: 'application/json; charset=utf-8', body: JSON.stringify(body) };
        cache.set(key, entry);
        settle(entry);
      } else { cache.delete(key); settle(null); }
      return json(body);
    };
    // An error or a closed connection must not leave waiters hanging.
    res.on('close', () => { if (cache.get(key)?.pending === pending) { cache.delete(key); settle(null); } });
    return next();
  };
}

module.exports = { microCache, _cache: cache };
