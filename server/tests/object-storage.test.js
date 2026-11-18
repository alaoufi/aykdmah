// AWS Signature V4 against the published AWS examples (S3 "Signature Calculations" docs), and the
// presigned URLs the media storage hands out (AYK-248).
const test = require('node:test');
const assert = require('node:assert');
const storage = require('../services/objectStorage');
const { signature } = storage._internal;

const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('header signature matches the AWS example (GET with Range)', () => {
  const { signature: sig, signedHeaders } = signature({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt',
    headers: { range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY, 'x-amz-date': '20130524T000000Z' },
    payloadHash: EMPTY, secret: SECRET, time: '20130524T000000Z', region: 'us-east-1', service: 's3',
  });
  assert.strictEqual(signedHeaders, 'host;range;x-amz-content-sha256;x-amz-date');
  assert.strictEqual(sig, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('query signature matches the AWS presigned URL example', () => {
  const { signature: sig } = signature({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt',
    query: {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request',
      'X-Amz-Date': '20130524T000000Z', 'X-Amz-Expires': '86400', 'X-Amz-SignedHeaders': 'host',
    },
    payloadHash: 'UNSIGNED-PAYLOAD', secret: SECRET, time: '20130524T000000Z', region: 'us-east-1', service: 's3',
  });
  assert.strictEqual(sig, 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

const cfg = { endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com', bucket: 'aykdmh-media', keyId: 'f42d0000000000000000000000000000', secret: 'x'.repeat(64) };
const now = new Date('2026-11-18T10:00:00Z');

test('download URL: path-style bucket, region auto, short expiry, response headers signed', () => {
  const url = new URL(storage.presign('GET', 'chat/2026/11/abc', { cfg, now, expires: 300, response: { 'response-content-type': 'video/mp4' } }));
  assert.strictEqual(url.origin, cfg.endpoint);
  assert.strictEqual(url.pathname, '/aykdmh-media/chat/2026/11/abc');
  assert.strictEqual(url.searchParams.get('X-Amz-Credential'), `${cfg.keyId}/20261118/auto/s3/aws4_request`);
  assert.strictEqual(url.searchParams.get('X-Amz-Expires'), '300');
  assert.strictEqual(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.strictEqual(url.searchParams.get('response-content-type'), 'video/mp4');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.ok(!url.href.includes(cfg.secret), 'the secret never appears in a URL');
});

test('upload URL binds the exact type and size; changing either changes the signature', () => {
  const a = new URL(storage.presign('PUT', 'chat/2026/11/abc', { cfg, now, contentType: 'video/mp4', contentLength: 1000 }));
  const b = new URL(storage.presign('PUT', 'chat/2026/11/abc', { cfg, now, contentType: 'video/mp4', contentLength: 1001 }));
  const c = new URL(storage.presign('PUT', 'chat/2026/11/abc', { cfg, now, contentType: 'audio/mp4', contentLength: 1000 }));
  assert.strictEqual(a.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
  assert.notStrictEqual(a.searchParams.get('X-Amz-Signature'), b.searchParams.get('X-Amz-Signature'));
  assert.notStrictEqual(a.searchParams.get('X-Amz-Signature'), c.searchParams.get('X-Amz-Signature'));
});

test('off unless fully configured; plain http only for a local test server outside production', () => {
  const saved = { ...process.env };
  try {
    for (const k of ['R2_MEDIA_ENDPOINT', 'R2_MEDIA_BUCKET', 'R2_MEDIA_ACCESS_KEY_ID', 'R2_MEDIA_SECRET_ACCESS_KEY']) delete process.env[k];
    assert.strictEqual(storage.enabled(), false);
    Object.assign(process.env, { R2_MEDIA_ENDPOINT: 'http://127.0.0.1:9000', R2_MEDIA_BUCKET: 'b', R2_MEDIA_ACCESS_KEY_ID: 'k', R2_MEDIA_SECRET_ACCESS_KEY: 's', NODE_ENV: 'test' });
    assert.strictEqual(storage.enabled(), true);
    process.env.NODE_ENV = 'production';
    assert.strictEqual(storage.enabled(), false);
    process.env.R2_MEDIA_ENDPOINT = 'http://evil.example';
    process.env.NODE_ENV = 'test';
    assert.strictEqual(storage.enabled(), false);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('object keys hold no user data', () => {
  assert.strictEqual(storage.objectKey('chat', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', now), 'chat/2026/11/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
});
