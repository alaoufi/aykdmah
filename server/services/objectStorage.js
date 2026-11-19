// User media in Cloudflare R2 (AYK-248, owner's decision 2026-11-17): chat and request attachments,
// voice notes and video clips are kept in the private bucket R2_MEDIA_BUCKET, never on the server's
// disk. The server signs requests itself (AWS Signature V4, path-style, region "auto"), so no SDK is
// needed:
// - put / head / getRange / remove: the server's own requests, signed in the Authorization header.
// - presign: a short-lived URL a phone or browser uses directly (download after the access check,
//   or a direct upload of one exact size and type).
// Presigned URLs are used from users' devices, so the media key must NOT carry Cloudflare's client
// IP filter (unlike the backup key). It is limited to this one bucket instead.
// Without R2_MEDIA_* the feature is off and uploads stay in the database as before (development, tests).
const crypto = require('crypto');

const REGION = 'auto';
const SERVICE = 's3';

function config() {
  const endpoint = String(process.env.R2_MEDIA_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.R2_MEDIA_BUCKET || '';
  const keyId = process.env.R2_MEDIA_ACCESS_KEY_ID || '';
  const secret = process.env.R2_MEDIA_SECRET_ACCESS_KEY || '';
  if (!endpoint || !bucket || !keyId || !secret) return null;
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(endpoint) && process.env.NODE_ENV !== 'production';
  if (!/^https:\/\//.test(endpoint) && !local) return null;
  return { endpoint, bucket, keyId, secret };
}

const enabled = () => Boolean(config());

// RFC 3986 encoding as S3 expects it ("/" kept between key segments).
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = path => path.split('/').map(encode).join('/');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const amzDate = (now = new Date()) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function signingKey(secret, day, region = REGION, service = SERVICE) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), 'aws4_request');
}

function canonicalQuery(params) {
  return Object.keys(params).sort().map(k => `${encode(k)}=${encode(String(params[k]))}`).join('&');
}

// Signature V4 of one request. headers: lower-case names, all signed.
function signature({ method, host, path, query = {}, headers = {}, payloadHash, secret, time, region = REGION, service = SERVICE }) {
  const day = time.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const all = { host, ...headers };
  const names = Object.keys(all).map(n => n.toLowerCase()).sort();
  const canonicalHeaders = names.map(n => `${n}:${String(all[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, encodePath(path), canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', time, scope, sha256(canonicalRequest)].join('\n');
  return { scope, signedHeaders, signature: hmac(signingKey(secret, day, region, service), toSign).toString('hex') };
}

function objectUrl(cfg, key) {
  const url = new URL(cfg.endpoint);
  return { host: url.host, path: `/${cfg.bucket}/${key}`, origin: url.origin };
}

// A URL valid for `expires` seconds. For PUT, the device must send exactly this Content-Type and
// Content-Length (both signed). `response` sets response-content-type / -disposition on downloads.
function presign(method, key, { expires = 300, contentType, contentLength, response = {}, now, cfg = config() } = {}) {
  if (!cfg) throw new Error('R2 media storage is not configured');
  const { host, path, origin } = objectUrl(cfg, key);
  const time = amzDate(now);
  const headers = {};
  if (method === 'PUT') {
    if (contentType) headers['content-type'] = contentType;
    if (contentLength != null) headers['content-length'] = String(contentLength);
  }
  const base = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.keyId}/${time.slice(0, 8)}/${REGION}/${SERVICE}/aws4_request`,
    'X-Amz-Date': time,
    'X-Amz-Expires': String(Math.min(Math.max(Math.floor(expires), 1), 604800)),
    'X-Amz-SignedHeaders': ['host', ...Object.keys(headers)].sort().join(';'),
  };
  for (const [name, value] of Object.entries(response)) if (value) base[name] = value;
  const { signature: sig } = signature({ method, host, path, query: base, headers, payloadHash: 'UNSIGNED-PAYLOAD', secret: cfg.secret, time });
  return `${origin}${encodePath(path)}?${canonicalQuery({ ...base, 'X-Amz-Signature': sig })}`;
}

async function request(method, key, { body, headers = {}, cfg = config() } = {}) {
  if (!cfg) throw new Error('R2 media storage is not configured');
  const { host, path, origin } = objectUrl(cfg, key);
  const time = amzDate();
  const payloadHash = sha256(body || '');
  const signed = { 'x-amz-content-sha256': payloadHash, 'x-amz-date': time, ...headers };
  const { scope, signedHeaders, signature: sig } = signature({ method, host, path, headers: signed, payloadHash, secret: cfg.secret, time });
  const response = await fetch(`${origin}${encodePath(path)}`, {
    method,
    body,
    headers: { ...signed, Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` },
    signal: AbortSignal.timeout(method === 'PUT' ? 120000 : 30000),
  });
  return response;
}

async function put(key, buffer, contentType) {
  const response = await request('PUT', key, { body: buffer, headers: { 'content-type': contentType } });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
}

// { size, type } of a stored object, or null when it does not exist.
async function head(key) {
  const response = await request('HEAD', key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 check failed (${response.status})`);
  return { size: Number(response.headers.get('content-length')), type: response.headers.get('content-type') || '' };
}

// Bytes start..end (inclusive) of an object, for checking its real format after a direct upload.
async function getRange(key, start, end) {
  const response = await request('GET', key, { headers: { range: `bytes=${start}-${end}` } });
  if (response.status !== 206 && response.status !== 200) throw new Error(`R2 read failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function remove(key) {
  const response = await request('DELETE', key);
  if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed (${response.status})`);
}

// One key per object: <scope>/<yyyy>/<mm>/<media id>. No user data in the key.
function objectKey(scope, id, now = new Date()) {
  return `${scope}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
}

module.exports = { enabled, config, presign, put, head, getRange, remove, objectKey, _internal: { signature, signingKey, encodePath, canonicalQuery, amzDate } };
