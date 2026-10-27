const crypto = require('crypto');
const { query, transaction } = require('../config/database');
const integrations = require('./integrations');
const { getPolicy, generateOtp } = require('./verificationService');
const UserVerification = require('../models/UserVerification');

// Codes sent before a session exists: sign-up and "forgot password" (AYK-016).
const PURPOSES = ['signup', 'reset'];
const DAILY_LIMIT = 10; // per phone and purpose, to bound SMS cost and abuse

const normalizePhone = value => String(value || '').trim().replace(/[\s()-]/g, '');
const validPhone = phone => /^\+?\d{8,15}$/.test(phone);
const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Sign-up verification is on whenever an SMS provider is active in the admin panel.
async function smsAvailable() {
  const { adapter, integration } = await integrations.resolveActive('sms');
  return Boolean(adapter?.send && integration);
}

async function sendCode({ phone, purpose, ip = null }) {
  if (!PURPOSES.includes(purpose)) throw fail('invalid_data');
  phone = normalizePhone(phone);
  if (!validPhone(phone)) throw fail('invalid_phone');
  const { adapter, integration } = await integrations.resolveActive('sms');
  if (!adapter?.send || !integration) return { required: false };
  const policy = await getPolicy();

  const code = generateOtp(policy.otp_length);
  await transaction(async conn => {
    // One sender at a time per phone keeps the resend wait and daily limit exact.
    await conn.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`phone_codes:${phone}:${purpose}`]);
    const [[recent]] = await conn.query(`SELECT COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - (?::int * INTERVAL '1 second')) AS recent,
      COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 day') AS today
      FROM phone_codes WHERE phone = ? AND purpose = ?`, [policy.otp_resend_seconds, phone, purpose]);
    if (Number(recent.recent) > 0) throw fail('throttled', 429, { retry_after: policy.otp_resend_seconds });
    if (Number(recent.today) >= DAILY_LIMIT) throw fail('daily_limit', 429);
    await conn.execute('UPDATE phone_codes SET consumed_at = CURRENT_TIMESTAMP WHERE phone = ? AND purpose = ? AND consumed_at IS NULL', [phone, purpose]);
    await conn.execute(`INSERT INTO phone_codes (phone, purpose, code_hash, max_attempts, expires_at, ip)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP + (?::int * INTERVAL '1 minute'), ?)`,
    [phone, purpose, UserVerification.hashCode(code), policy.otp_max_attempts, policy.otp_ttl_minutes, ip]);
  });

  const message = `أي خدمة: رمز التحقق ${code} — صالح ${policy.otp_ttl_minutes} دقائق. Ay Khidma code: ${code}`;
  try {
    await adapter.send({ credentials: integration.credentials || {}, config: integration.config || {}, to: phone, message });
  } catch (err) {
    // A code that never left must not block a retry for the resend wait.
    await query('DELETE FROM phone_codes WHERE phone = ? AND purpose = ? AND consumed_at IS NULL', [phone, purpose]);
    throw fail('sms_failed', 502);
  }
  return { required: true, sent: true, length: policy.otp_length, ttl_minutes: policy.otp_ttl_minutes, resend_seconds: policy.otp_resend_seconds };
}

// Checks and consumes the latest code. Wrong codes count against max_attempts.
async function verifyCode({ phone, purpose, code }) {
  phone = normalizePhone(phone);
  return transaction(async conn => {
    const [[row]] = await conn.query(`SELECT * FROM phone_codes WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1 FOR UPDATE`, [phone, purpose]);
    if (!row) return { ok: false, reason: 'no_active_code' };
    if (row.attempts >= row.max_attempts) {
      await conn.execute('UPDATE phone_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
      return { ok: false, reason: 'max_attempts' };
    }
    const expected = Buffer.from(UserVerification.hashCode(String(code || '')), 'hex');
    const actual = Buffer.from(String(row.code_hash), 'hex');
    if (!/^\d{4,10}$/.test(String(code || '')) || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      await conn.execute('UPDATE phone_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return { ok: false, reason: 'invalid_code', remaining: Math.max(0, row.max_attempts - row.attempts - 1) };
    }
    await conn.execute('UPDATE phone_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    return { ok: true };
  });
}

module.exports = { sendCode, verifyCode, smsAvailable, normalizePhone, PURPOSES };
