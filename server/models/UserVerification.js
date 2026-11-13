const crypto = require('crypto');
const { query, queryOne, transaction } = require('../config/database');
const env = require('../config/env');

function hashCode(code, salt) {
  return crypto.createHmac('sha256', salt || env.JWT.SECRET).update(String(code)).digest('hex');
}

// ---- user_verifications ----
async function getStatus(userId) {
  const rows = await query(
    `SELECT method, status, identifier, verified_at, expires_at
     FROM user_verifications WHERE user_id = ?`,
    [userId]
  );
  const map = { sms: null, whatsapp: null, email: null, nafath: null };
  for (const r of rows) map[r.method] = r;
  return map;
}

async function upsert({ user_id, method, status, identifier = null, expires_at = null, metadata = null }) {
  await query(
    `INSERT INTO user_verifications (user_id, method, status, identifier,
       verified_at, expires_at, metadata)
     VALUES (?, ?, ?, ?, ${status === 'verified' ? 'CURRENT_TIMESTAMP' : 'NULL'}, ?, ?)
     ON CONFLICT (user_id, method) DO UPDATE SET
       status = EXCLUDED.status,
       identifier = EXCLUDED.identifier,
       verified_at = ${status === 'verified' ? 'CURRENT_TIMESTAMP' : 'NULL'},
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata`,
    [user_id, method, status, identifier, expires_at, metadata ? JSON.stringify(metadata) : null]
  );
  return queryOne(
    'SELECT * FROM user_verifications WHERE user_id = ? AND method = ?',
    [user_id, method]
  );
}

async function markVerified(userId, method, identifier, metadata = null) {
  return upsert({ user_id: userId, method, status: 'verified', identifier, metadata });
}

// ---- OTP lifecycle ----
async function createOtp({ user_id, method, identifier, code, ttlMinutes = 10, maxAttempts = 5, throttleSeconds = 60, ip = null }) {
  return transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user_id]);
    const [recent] = await conn.query(`SELECT id FROM verification_otps WHERE user_id = ? AND method = ?
      AND created_at > CURRENT_TIMESTAMP - (?::int * INTERVAL '1 second') LIMIT 1`, [user_id, method, throttleSeconds]);
    if (recent.length) throw Object.assign(new Error('throttled'), { status: 429 });
    // Invalidate any previous unconsumed OTPs for same (user, method)
    await conn.execute(
      `UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND method = ? AND consumed_at IS NULL`,
      [user_id, method]
    );
    const code_hash = hashCode(code);
    const [result] = await conn.execute(
      `INSERT INTO verification_otps
        (user_id, method, identifier, code_hash, max_attempts, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), ?)`,
      [user_id, method, identifier, code_hash, maxAttempts, ttlMinutes, ip]
    );
    return result.insertId;
  });
}

async function findActiveOtp(userId, method) {
  return queryOne(
    `SELECT * FROM verification_otps
     WHERE user_id = ? AND method = ? AND consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY id DESC LIMIT 1`,
    [userId, method]
  );
}

async function lastSentAt(userId, method) {
  const row = await queryOne(
    `SELECT created_at FROM verification_otps
     WHERE user_id = ? AND method = ?
     ORDER BY id DESC LIMIT 1`,
    [userId, method]
  );
  return row ? row.created_at : null;
}

async function consumeOtp(otpId) {
  await query(
    `UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [otpId]
  );
}

async function bumpAttempts(otpId) {
  await query('UPDATE verification_otps SET attempts = attempts + 1 WHERE id = ?', [otpId]);
}

async function verifyOtp(userId, method, code, { verifyAccount = false } = {}) {
  return transaction(async conn => {
    const [users] = await conn.query('SELECT id, phone, email FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0 FOR UPDATE', [userId]);
    const user = users[0];
    if (!user) return { ok: false, reason: 'no_active_otp' };
    const [rows] = await conn.query(`SELECT * FROM verification_otps
      WHERE user_id = ? AND method = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1 FOR UPDATE`, [userId, method]);
    const row = rows[0];
    if (!row) return { ok: false, reason: 'no_active_otp' };
    const identifier = String(method === 'email' ? user.email || '' : user.phone || '').trim();
    if (verifyAccount && (!identifier || row.identifier.toLowerCase() !== identifier.toLowerCase())) {
      await conn.execute('UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
      return { ok: false, reason: 'invalid_identifier' };
    }
    if (row.attempts >= row.max_attempts) {
      await conn.execute('UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
      return { ok: false, reason: 'max_attempts' };
    }
    const expected = hashCode(code);
    const actual = Buffer.from(String(row.code_hash), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
      await conn.execute('UPDATE verification_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return { ok: false, reason: 'invalid_code', remaining: row.max_attempts - row.attempts - 1 };
    }
    await conn.execute('UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    if (verifyAccount) {
      await conn.execute(`INSERT INTO user_verifications (user_id, method, status, identifier, verified_at, metadata)
        VALUES (?, ?, 'verified', ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT (user_id, method) DO UPDATE SET status = 'verified', identifier = EXCLUDED.identifier,
        verified_at = CURRENT_TIMESTAMP, expires_at = NULL, metadata = EXCLUDED.metadata`,
      [userId, method, identifier, JSON.stringify({ confirmed_via: 'otp' })]);
      await conn.execute(method === 'email'
        ? 'UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?'
        : 'UPDATE users SET is_verified = 1, phone_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    }
    return { ok: true, identifier: row.identifier };
  });
}

async function findCurrent(userId, method) {
  return queryOne('SELECT * FROM user_verifications WHERE user_id = ? AND method = ?', [userId, method]);
}

async function approveNafath(userId, transactionId, integrationId, provider, metadata) {
  return transaction(async conn => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [rows] = await conn.query("SELECT * FROM user_verifications WHERE user_id = ? AND method = 'nafath' FOR UPDATE", [userId]);
    const row = rows[0];
    const current = typeof row?.metadata === 'string' ? JSON.parse(row.metadata) : row?.metadata;
    if (!row || row.status !== 'pending' || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()
        || current?.transactionId !== transactionId || current?.integrationId !== integrationId || current?.provider !== provider) return false;
    await conn.execute("UPDATE user_verifications SET status = 'verified', verified_at = CURRENT_TIMESTAMP, expires_at = NULL, metadata = ? WHERE id = ?", [JSON.stringify({ ...current, ...metadata }), row.id]);
    await conn.execute('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);
    return true;
  });
}

// ---- audit ----
async function audit({ user_id, method, action, result = null, details = null, ip = null }) {
  await query(
    `INSERT INTO verification_audit (user_id, method, action, result, details, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, method, action, result, details ? String(details).slice(0, 490) : null, ip]
  );
}

async function listAudit(userId, { limit = 30 } = {}) {
  return query(
    `SELECT * FROM verification_audit WHERE user_id = ?
     ORDER BY id DESC LIMIT ?`,
    [userId, Number(limit)]
  );
}

module.exports = {
  hashCode,
  getStatus, upsert, markVerified, findCurrent, approveNafath,
  createOtp, findActiveOtp, lastSentAt, consumeOtp, verifyOtp,
  audit, listAudit,
};
