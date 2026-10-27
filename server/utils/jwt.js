const jwt = require('jsonwebtoken');
const env = require('../config/env');

function sign(payload, options = {}) {
  return jwt.sign(payload, env.JWT.SECRET, {
    expiresIn: env.JWT.EXPIRES_IN,
    ...options,
    algorithm: 'HS256',
  });
}

function verify(token) {
  const payload = jwt.verify(token, env.JWT.SECRET, { algorithms: ['HS256'] });
  if (!payload || typeof payload !== 'object' || !['number', 'string'].includes(typeof payload.id)
      || (typeof payload.id === 'string' && !/^\d+$/.test(payload.id)) || !Number.isSafeInteger(Number(payload.id))
      || Number(payload.id) <= 0 || !['client', 'provider', 'admin'].includes(payload.role)
      || (payload.auth_version !== undefined && (!Number.isSafeInteger(payload.auth_version) || payload.auth_version < 0))) {
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
