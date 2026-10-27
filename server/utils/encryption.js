// AES-256-GCM helpers for storing sensitive integration credentials.
//
// Key resolution (in order):
//   1. process.env.ENCRYPTION_KEY  — 32 bytes base64 or hex
//   2. SHA-256 of process.env.JWT_SECRET (deterministic fallback so a
//      single-secret deployment still works)
//
// All ciphertexts are stored as a single base64 string in the form:
//   v1:<iv_b64>:<tag_b64>:<ct_b64>
// — the "v1:" prefix lets us migrate algorithms later without breaking
// existing rows.

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const PREFIX = 'v1';

let cachedKey = null;
function resolveKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    // Accept hex (64 chars) or base64
    let buf;
    try { buf = Buffer.from(raw, /^[0-9a-f]{64}$/i.test(raw) ? 'hex' : 'base64'); }
    catch (_) { buf = null; }
    if (buf && buf.length === 32) { cachedKey = buf; return cachedKey; }
    throw new Error('ENCRYPTION_KEY must encode exactly 32 bytes');
  }
  const seed = process.env.JWT_SECRET;
  if (!seed || seed.length < 32) throw new Error('Configure ENCRYPTION_KEY or a strong JWT_SECRET for encryption');
  cachedKey = crypto.createHash('sha256').update(seed).digest();
  return cachedKey;
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(blob) {
  if (!blob) return null;
  const parts = String(blob).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    if (/^v\d+:/.test(String(blob))) throw new Error('Unsupported encrypted credential format');
    // Explicit legacy plaintext compatibility. All new writes use encrypt().
    return blob;
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const parseBase64 = value => {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) throw new Error('Invalid encrypted credential encoding');
    return bytes;
  };
  const iv = parseBase64(ivB64), tag = parseBase64(tagB64), ct = parseBase64(ctB64);
  if (iv.length !== IV_LEN || tag.length !== 16) throw new Error('Invalid encrypted credential envelope');
  const key = resolveKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([
    decipher.update(ct),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

// Serialise an entire credentials object as one encrypted JSON blob.
function encryptJson(obj) {
  if (!obj) return null;
  return encrypt(JSON.stringify(obj));
}

function decryptJson(blob) {
  const s = decrypt(blob);
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

// Mask a credentials object for safe display in the admin UI:
// keep only the last 4 chars of any value.
function maskCredentials(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) { out[k] = null; continue; }
    const s = String(v);
    out[k] = s.length <= 4 ? '****' : '•'.repeat(Math.min(s.length - 4, 12)) + s.slice(-4);
  }
  return out;
}

module.exports = { encrypt, decrypt, encryptJson, decryptJson, maskCredentials };
