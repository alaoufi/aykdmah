const http2 = require('http2');
const crypto = require('crypto');
const logger = require('../utils/logger');

// The iPhone app (AYK-138): notifications straight to Apple (APNs), no third party. Configured
// by APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY (the .p8 key's text) and APNS_BUNDLE_ID; silent until
// they are set. A device's token is 64 hex characters, which is how it is told from an Android one.
const APPLE_TOKEN = /^[0-9a-f]{64}$/;
const isAppleToken = token => typeof token === 'string' && APPLE_TOKEN.test(token);

function config() {
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_BUNDLE_ID: bundleId } = process.env;
  const key = (process.env.APNS_KEY || '').replace(/\\n/g, '\n');
  if (!keyId || !teamId || !bundleId || !key.includes('PRIVATE KEY')) return null;
  return { keyId, teamId, bundleId, key, host: process.env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com' };
}
const isConfigured = () => Boolean(config());

// The provider token (ES256 JWT), reused for 50 minutes as Apple asks.
let jwtCache = null;
function providerToken(cfg) {
  if (jwtCache && jwtCache.expires > Date.now()) return jwtCache.token;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: cfg.keyId })}.${b64({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: cfg.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwtCache = { token: `${unsigned}.${signature}`, expires: Date.now() + 50 * 60 * 1000 };
  return jwtCache.token;
}

let session = null;
function connection(host) {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(host);
  session.on('error', err => { logger.warn('APNs connection:', err.message); session = null; });
  session.on('goaway', () => { session = null; });
  session.unref();
  return session;
}

function post(cfg, token, headers, body) {
  return new Promise(resolve => {
    let req;
    try {
      req = connection(cfg.host).request({
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${providerToken(cfg)}`,
        'apns-topic': cfg.bundleId, 'content-type': 'application/json', ...headers,
      });
    } catch (err) { resolve({ status: 0, reason: err.message }); return; }
    let status = 0; let text = '';
    req.setTimeout(10000, () => req.close());
    req.on('response', h => { status = h[':status']; });
    req.on('data', chunk => { text += chunk; });
    req.on('end', () => { let reason = ''; try { reason = JSON.parse(text).reason || ''; } catch (_) { /* empty body on success */ } resolve({ status, reason }); });
    req.on('error', err => resolve({ status: 0, reason: err.message }));
    req.end(JSON.stringify(body));
  });
}

// An alert the phone shows itself, app closed or not. A call is time-sensitive (it breaks
// through Focus) and expires in 45 s; a message waits up to a day. One per conversation.
async function send(tokens, data, { ttlSeconds = 45, onGone } = {}) {
  const cfg = config();
  // Only what the phone should show: a call, a message. "Call ended" has nothing to show.
  if (!cfg || !tokens.length || !data.title) return 0;
  const call = data.kind === 'call';
  const tag = data.tag || (data.call_id ? `call-${data.call_id}` : null);
  const url = data.url || (data.conversation_id ? `/chat/${data.conversation_id}` : '/');
  const body = {
    aps: {
      alert: { title: data.title || '', body: data.body || '' },
      sound: 'default',
      'thread-id': tag || undefined,
      'interruption-level': call ? 'time-sensitive' : 'active',
    },
    url, kind: data.kind || undefined,
  };
  const headers = {
    'apns-push-type': 'alert', 'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + ttlSeconds),
    ...(tag ? { 'apns-collapse-id': String(tag).slice(0, 64) } : {}),
  };
  let sent = 0;
  await Promise.all(tokens.map(async token => {
    const { status, reason } = await post(cfg, token, headers, body);
    if (status === 200) { sent += 1; return; }
    if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') await onGone?.(token);
    logger.warn(`APNs send failed: status=${status} reason=${reason}`);
  }));
  return sent;
}

module.exports = { isAppleToken, isConfigured, send };
