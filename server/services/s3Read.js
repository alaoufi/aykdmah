// The two R2 (S3 API) reads the backups report needs, signed with AWS Signature V4, without
// libraries: list a folder of a bucket, and stream one object. The same file as
// alaoufi/server-edge backups-monitor/s3.js (tested there against botocore, AWS's own library).
const crypto = require('node:crypto');

const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = path => path.split('/').map(encode).join('/');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const amzDate = (now = new Date()) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const EMPTY_HASH = sha256('');

function canonicalQuery(params) {
  return Object.keys(params).sort().map(k => `${encode(k)}=${encode(String(params[k]))}`).join('&');
}

// headers: lower-case names, all signed.
function sign({ method, host, path, query = {}, headers = {}, payloadHash, keyId, secret, time, region = 'auto' }) {
  const day = time.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const all = { host, ...headers };
  const names = Object.keys(all).map(n => n.toLowerCase()).sort();
  const canonicalHeaders = names.map(n => `${n}:${String(all[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, encodePath(path), canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', time, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
  return `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(key, toSign).toString('hex')}`;
}

async function signedFetch(site, path, query = {}, { signal } = {}) {
  const url = new URL(site.endpoint);
  const time = amzDate();
  const headers = { 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': time };
  const authorization = sign({ method: 'GET', host: url.host, path, query, headers, payloadHash: EMPTY_HASH, keyId: site.keyId, secret: site.secret, time });
  const qs = canonicalQuery(query);
  return fetch(`${url.origin}${encodePath(path)}${qs ? `?${qs}` : ''}`, { headers: { ...headers, Authorization: authorization }, signal });
}

const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml); return m ? xmlText(m[1]) : null; };

// Every object under `prefix` (at most `max`): [{ key, size, modified }].
async function list(site, prefix, { max = 5000 } = {}) {
  const objects = [];
  let token = null;
  do {
    const query = { 'list-type': '2', prefix, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const res = await signedFetch(site, `/${site.bucket}`, query, { signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    if (!res.ok) throw Object.assign(new Error(`R2 ${res.status} ${tag(body, 'Code') || ''}`.trim()), { status: res.status });
    for (const m of body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      objects.push({ key: tag(m[1], 'Key'), size: Number(tag(m[1], 'Size')) || 0, modified: tag(m[1], 'LastModified') });
    }
    token = tag(body, 'IsTruncated') === 'true' ? tag(body, 'NextContinuationToken') : null;
  } while (token && objects.length < max);
  return objects;
}

// One object as a Node stream (http.IncomingMessage: statusCode, headers, pipe). Not fetch: when
// the person downloading reads slower than R2 sends, Node's fetch could stop the whole process
// with an internal assertion (found streaming a backup to a slow browser); the classic http
// client applies back-pressure safely. The caller pipes it and destroys it if the download stops.
function get(site, key, { signal } = {}) {
  const url = new URL(site.endpoint);
  const objectPath = `/${site.bucket}/${key}`;
  const time = amzDate();
  const headers = { 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': time };
  const authorization = sign({ method: 'GET', host: url.host, path: objectPath, headers, payloadHash: EMPTY_HASH, keyId: site.keyId, secret: site.secret, time });
  const client = url.protocol === 'https:' ? require('node:https') : require('node:http');
  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, method: 'GET', path: encodePath(objectPath),
      headers: { ...headers, host: url.host, Authorization: authorization }, signal,
    }, resolve);
    req.setTimeout(30000, () => req.destroy(new Error('R2 did not answer in time')));
    req.on('error', reject);
    req.end();
  });
}

module.exports = { list, get, _internal: { sign, canonicalQuery, encodePath, amzDate } };
