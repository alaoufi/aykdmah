const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

class AuthRateLimitStore {
  constructor(namespace) { this.namespace = namespace; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  hash(key) { return crypto.createHash('sha256').update(`${this.namespace}:${key}`).digest('hex'); }
  async increment(key) {
    const { queryOne, query } = require('../config/database');
    const row = await queryOne(`INSERT INTO auth_rate_limits (key, total_hits, reset_at)
      VALUES (?, 1, CURRENT_TIMESTAMP + (?::int * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO UPDATE SET
        total_hits = CASE WHEN auth_rate_limits.reset_at <= CURRENT_TIMESTAMP THEN 1 ELSE auth_rate_limits.total_hits + 1 END,
        reset_at = CASE WHEN auth_rate_limits.reset_at <= CURRENT_TIMESTAMP THEN EXCLUDED.reset_at ELSE auth_rate_limits.reset_at END
      RETURNING total_hits, reset_at`, [this.hash(key), this.windowMs]);
    if (crypto.randomInt(100) === 0) {
      await query('DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE reset_at < CURRENT_TIMESTAMP LIMIT 1000)');
    }
    return { totalHits: Number(row.total_hits), resetTime: new Date(row.reset_at) };
  }
  async decrement(key) {
    await require('../config/database').query('UPDATE auth_rate_limits SET total_hits = GREATEST(0, total_hits - 1) WHERE key = ?', [this.hash(key)]);
  }
  async resetKey(key) {
    await require('../config/database').query('DELETE FROM auth_rate_limits WHERE key = ?', [this.hash(key)]);
  }
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Polling uses several authenticated reads per refresh on serverless hosts.
  max: Number(process.env.API_RATE_LIMIT) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'تجاوزت الحد المسموح من الطلبات. حاول لاحقاً.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: new AuthRateLimitStore('auth-ip'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة. حاول لاحقاً.' },
});

const accountAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  store: new AuthRateLimitStore('auth-account'),
  keyGenerator: req => String(req.body?.identifier || req.body?.email || '').trim().toLowerCase().replace(/[\s()-]/g, '').slice(0, 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة. حاول لاحقاً.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  store: new AuthRateLimitStore('upload-ip'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'تجاوزت حد رفع الملفات. حاول لاحقاً.' },
});

module.exports = { generalLimiter, authLimiter, accountAuthLimiter, uploadLimiter, AuthRateLimitStore };
