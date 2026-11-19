const { AuthRateLimitStore } = require('../middleware/rateLimiter');

// Per-user counters live in Postgres, so extra tabs, reconnects, conversations,
// and application instances share the same allowance. Separate location and
// chat budgets allow live GPS updates without exhausting ordinary messages.
const LIMITS = Object.freeze({ chat: 60, location: 120 });
const stores = Object.fromEntries(Object.keys(LIMITS).map(kind => {
  const store = new AuthRateLimitStore(`socket-${kind}-user`);
  store.init({ windowMs: 60 * 1000 });
  return [kind, store];
}));

async function consumeSocketWrite(userId, kind) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1 || !Object.hasOwn(stores, kind)) {
    throw new Error('Invalid socket write');
  }
  const result = await stores[kind].increment(String(userId));
  if (result.totalHits <= LIMITS[kind]) return { ok: true };
  return {
    ok: false, error: 'rate_limited',
    retry_after: Math.max(1, Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)),
  };
}

module.exports = { consumeSocketWrite, LIMITS };
