const jwt = require('jsonwebtoken');
const env = require('../config/env');

function sign(payload, options = {}) {
  return jwt.sign(payload, env.JWT.SECRET, {
    expiresIn: env.JWT.EXPIRES_IN,
    ...options,
    algorithm: 'HS256',
  });
}

// AYK-251: a session token is checked on every request. Its signature never changes, so a token
// already proven genuine is remembered until it expires (at most 10 minutes here) instead of
// redoing the cryptography each time: about 6% of the server's work when thousands open the app.
// What can change (blocked account, signed out, password changed) is still read from the
// database on every request by the callers, exactly as before.
const verified = new Map(); // token -> { payload, until }
const REMEMBER_MS = 10 * 60 * 1000;
const REMEMBER_MAX = 50000;

function verifySignature(token) {
  const now = Date.now();
  const known = verified.get(token);
  if (known && known.until > now) return known.payload;
  const payload = jwt.verify(token, env.JWT.SECRET, { algorithms: ['HS256'] });
  if (typeof token === 'string' && payload && typeof payload === 'object') {
    if (verified.size >= REMEMBER_MAX) verified.clear();
    verified.set(token, { payload, until: Math.min(now + REMEMBER_MS, payload.exp ? payload.exp * 1000 : now + REMEMBER_MS) });
  }
  return payload;
}

function verify(token) {
  const payload = verifySignature(token);
  if (!payload || typeof payload !== 'object' || !['number', 'string'].includes(typeof payload.id)
      || (typeof payload.id === 'string' && !/^\d+$/.test(payload.id)) || !Number.isSafeInteger(Number(payload.id))
      || Number(payload.id) <= 0 || !['client', 'provider', 'admin'].includes(payload.role)
      || (payload.auth_version !== undefined && (!Number.isSafeInteger(payload.auth_version) || payload.auth_version < 0))
      // The session's area (AYK-151): "site" (the site and the app) or "admin", and its version.
      || (payload.scope !== undefined && !['site', 'admin'].includes(payload.scope))
      || (payload.sv !== undefined && (!Number.isSafeInteger(payload.sv) || payload.sv < 0))) {
    throw new Error('Invalid session claims');
  }
  return payload;
}

function decode(token) {
  try {
    return jwt.decode(token);
  } catch (_) {
    return null;
  }
}

module.exports = { sign, verify, decode };
