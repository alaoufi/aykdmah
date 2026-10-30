const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Firebase Cloud Messaging for the Android app (AYK-094): reaches the app even when it is
// closed, so an incoming call rings like a phone call. The service-account key lives only in
// the server's .env (FCM_SERVICE_ACCOUNT_B64, base64 of the JSON key), never in the repository.
let account;
function serviceAccount() {
  if (account !== undefined) return account;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_B64;
    const parsed = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
    account = parsed?.client_email && parsed?.private_key && parsed?.project_id ? parsed : null;
  } catch (_) { account = null; }
  return account;
}
const isConfigured = () => Boolean(serviceAccount());

let cached = null;
async function accessToken(sa) {
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`fcm_oauth_${res.status}`);
  const body = await res.json();
  cached = { token: body.access_token, expires: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return cached.token;
}

const TOKEN = /^[A-Za-z0-9:_\-]{20,512}$/;
const validToken = token => typeof token === 'string' && TOKEN.test(token);

// The device's token now rings for whoever is signed in on it.
async function saveToken(userId, token, appVersion) {
  if (!validToken(token)) return false;
  const version = typeof appVersion === 'string' ? appVersion.slice(0, 20) : null;
  await query(`INSERT INTO native_push_tokens (user_id, token, app_version) VALUES (?, ?, ?)
    ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, app_version = EXCLUDED.app_version, updated_at = CURRENT_TIMESTAMP`,
  [userId, token, version]);
  return true;
}

const countForUser = async userId => Number((await query('SELECT COUNT(*) AS n FROM native_push_tokens WHERE user_id = ?', [userId]))[0]?.n || 0);

// Data-only, high priority: the app decides how to show it (a ringing call screen).
async function sendToUser(userId, data, { ttlSeconds = 45 } = {}) {
  const sa = serviceAccount();
  if (!sa) return 0;
  const rows = await query('SELECT token FROM native_push_tokens WHERE user_id = ?', [userId]);
  if (!rows.length) return 0;
  const auth = await accessToken(sa);
  const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  let sent = 0;
  await Promise.all(rows.map(async ({ token }) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: payload, android: { priority: 'HIGH', ttl: `${ttlSeconds}s` } } }),
    }).catch(err => ({ ok: false, status: 0, text: async () => err.message }));
    if (res.ok) { sent += 1; return; }
    const text = await res.text().catch(() => '');
    // Uninstalled or replaced: forget the token.
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) await query('DELETE FROM native_push_tokens WHERE token = ?', [token]);
    logger.warn(`FCM send failed: status=${res.status} user=${userId}`);
  }));
  return sent;
}

module.exports = { isConfigured, saveToken, sendToUser, countForUser, validToken };
