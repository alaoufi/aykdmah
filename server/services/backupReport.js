// The backups report in the admin area (AYK-271): what this site has in its R2 backups bucket
// (newest, age, size, count, last successful restore test), read with a READ-ONLY key:
//   R2_BACKUPS_ENDPOINT, R2_BACKUPS_BUCKET (default aykdmh-backups),
//   R2_BACKUPS_READ_KEY_ID, R2_BACKUPS_READ_SECRET     (deploy/r2-backups-read-setup.sh)
// The backups are encrypted on the server before upload; the encryption key is not here, so a
// downloaded backup opens only with the key the owner keeps.
const crypto = require('crypto');
const path = require('path');
const s3 = require('./s3Read');

const EXPECT_HOURS = 26;
const LINK_SECONDS = 120;

function config() {
  const endpoint = String(process.env.R2_BACKUPS_ENDPOINT || '').replace(/\/+$/, '');
  const keyId = process.env.R2_BACKUPS_READ_KEY_ID || '';
  const secret = process.env.R2_BACKUPS_READ_SECRET || '';
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(endpoint) && process.env.NODE_ENV !== 'production';
  if (!keyId || !secret || !(local || /^https:\/\/[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com$/.test(endpoint))) return null;
  return { endpoint, bucket: process.env.R2_BACKUPS_BUCKET || 'aykdmh-backups', keyId, secret };
}

// The daily timer (setup-server.sh) starts at 00:30 UTC; a backup that reached R2 within the next
// 90 minutes is the scheduled one, any other is a manual run.
const isDaily = iso => { const d = new Date(iso); const m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m >= 30 && m <= 120; };

let cache = null; // { at, value }
async function status({ fresh = false } = {}) {
  const cfg = config();
  if (!cfg) return { configured: false };
  if (!fresh && cache && Date.now() - cache.at < 60000) return cache.value;
  let value;
  try {
    const [backups, verified] = await Promise.all([s3.list(cfg, 'daily/'), s3.list(cfg, 'verified/').catch(() => [])]);
    const byNewest = (a, b) => String(b.modified).localeCompare(String(a.modified));
    backups.sort(byNewest); verified.sort(byNewest);
    const newest = backups[0] || null;
    const tested = new Set(verified.map(v => path.basename(v.key).replace(/\.json$/, '')));
    const ageHours = newest ? (Date.now() - Date.parse(newest.modified)) / 3600e3 : null;
    value = {
      configured: true, bucket: cfg.bucket, expect_hours: EXPECT_HOURS,
      healthy: Boolean(newest) && ageHours <= EXPECT_HOURS,
      age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      newest: newest && { name: path.basename(newest.key), modified: newest.modified, size: newest.size },
      count: backups.length, total_bytes: backups.reduce((sum, o) => sum + o.size, 0),
      last_verified: verified[0] ? { modified: verified[0].modified, backup: path.basename(verified[0].key).replace(/\.json$/, '') } : null,
      backups: backups.map(o => ({
        key: o.key, name: path.basename(o.key), size: o.size, modified: o.modified,
        verified: tested.has(path.basename(o.key)), automatic: isDaily(o.modified),
      })),
    };
  } catch (err) {
    value = { configured: true, bucket: cfg.bucket, error: err.status === 403 ? 'access_denied' : err.status ? `r2_${err.status}` : 'r2_unreachable', backups: [] };
  }
  cache = { at: Date.now(), value };
  return value;
}

// A download link for one listed backup, valid two minutes, for one administrator: the browser
// opens it directly (no sign-in header), so it must not be reusable by anyone else or later.
const sign = text => crypto.createHmac('sha256', `backup-link:${process.env.JWT_SECRET || ''}`).update(text).digest('base64url');
function linkToken(key, userId, now = Date.now()) {
  const expires = Math.floor(now / 1000) + LINK_SECONDS;
  const body = Buffer.from(JSON.stringify({ k: key, u: Number(userId), e: expires })).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readToken(token, now = Date.now()) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (!data || typeof data.k !== 'string' || !Number.isSafeInteger(data.u) || !(data.e * 1000 > now)) return null;
  return { key: data.k, userId: data.u };
}

async function isListed(key) {
  if (!/^daily\/[\w.-]+$/.test(key)) return false;
  const found = s => (s.backups || []).some(o => o.key === key);
  return found(await status()) || found(await status({ fresh: true }));
}

function open(key, { signal } = {}) { return s3.get(config(), key, { signal }); }

module.exports = { config, status, linkToken, readToken, isListed, open, _internal: { LINK_SECONDS, isDaily, reset: () => { cache = null; } } };
