// AYK-248 phase B: large chat media (video clips up to 100 MB, long voice notes) go from the phone
// straight to R2, never through or onto this server.
// 1. createTicket: the sender asks to upload one file into one conversation. The server checks
//    the kind, size and duration against the owner's limits (settings, "files" group), writes a
//    'pending' row and signs a 15-minute PUT URL bound to that exact Content-Type and size.
// 2. The phone PUTs the bytes to R2.
// 3. claim: when the message is sent with media_ids, each pending row of that sender and
//    conversation is checked in R2 (exact size, real format from its first bytes), then becomes
//    'ready'. A file that fails is deleted. Pending rows nobody claims are removed after 2 hours.
const { randomUUID } = require('crypto');
const path = require('path');
const { query, queryOne } = require('../config/database');
const Setting = require('../models/Setting');
const storage = require('./objectStorage');

const DEFAULT_LIMITS = {
  media_video_max_mb: 100, media_video_max_seconds: 180,
  media_voice_max_mb: 20, media_voice_max_seconds: 600,
  media_image_max_mb: 10, media_file_max_mb: 20,
};
// The database refuses anything above 100 MB whatever the settings say.
const HARD_MAX_BYTES = 100 * 1024 * 1024;
const TICKET_SECONDS = 15 * 60;
const PENDING_HOURS = 2;

// Type -> kind and the extensions that may carry it (same set as the multipart upload).
const TYPES = {
  'image/jpeg': ['image', ['.jpg', '.jpeg']], 'image/png': ['image', ['.png']], 'image/webp': ['image', ['.webp']],
  'application/pdf': ['file', ['.pdf']],
  'audio/mpeg': ['voice', ['.mp3']], 'audio/wav': ['voice', ['.wav']], 'audio/webm': ['voice', ['.webm']],
  'audio/ogg': ['voice', ['.ogg']], 'audio/mp4': ['voice', ['.m4a', '.mp4']], 'audio/x-m4a': ['voice', ['.m4a']],
  'video/mp4': ['video', ['.mp4']], 'video/quicktime': ['video', ['.mov']], 'video/webm': ['video', ['.webm']],
  'video/ogg': ['video', ['.ogv', '.ogg']],
};

// Container signatures checked on the first bytes after a direct upload. The bytes are served
// only from R2's own origin with the stored Content-Type, never from this site's origin.
const MAGIC = {
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/webp': b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': b => /^%PDF-[12]\.\d/.test(b.toString('ascii', 0, 8)),
  'audio/mpeg': b => b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'audio/wav': b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE',
  ebml: b => b.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')),
  ogg: b => b.toString('ascii', 0, 4) === 'OggS',
  isoBmff: b => b.toString('ascii', 4, 8) === 'ftyp',
};
const magicFor = type => ({
  'audio/webm': MAGIC.ebml, 'video/webm': MAGIC.ebml, 'audio/ogg': MAGIC.ogg, 'video/ogg': MAGIC.ogg,
  'audio/mp4': MAGIC.isoBmff, 'audio/x-m4a': MAGIC.isoBmff, 'video/mp4': MAGIC.isoBmff, 'video/quicktime': MAGIC.isoBmff,
}[type] || MAGIC[type]);

function uploadError(i18nKey, status = 400) {
  return Object.assign(new Error(i18nKey), { status, i18nKey });
}

async function limits() {
  const saved = await Setting.getMany(Object.keys(DEFAULT_LIMITS)).catch(() => ({}));
  const result = { direct: storage.enabled() };
  for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const value = Number(saved[key]);
    result[key.replace(/^media_/, '')] = Number.isFinite(value) && value > 0 ? value : fallback;
  }
  return result;
}

function maxBytes(kind, l) {
  const mb = { video: l.video_max_mb, voice: l.voice_max_mb, image: l.image_max_mb, file: l.file_max_mb }[kind];
  return Math.min(Math.round(mb * 1024 * 1024), HARD_MAX_BYTES);
}

async function cleanupPending(limit = 20) {
  const stale = await query(`SELECT id, object_key FROM uploaded_media WHERE status = 'pending'
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '${PENDING_HOURS} hours' ORDER BY created_at LIMIT ${Number(limit)}`);
  for (const row of stale) {
    await storage.remove(row.object_key).catch(() => {});
    await query("DELETE FROM uploaded_media WHERE id = ? AND status = 'pending'", [row.id]);
  }
  return stale.length;
}

async function createTicket({ userId, conversationId, fileName, type, size, durationSeconds }) {
  if (!storage.enabled()) throw uploadError('upload_direct_unavailable', 503);
  const mime = String(type || '').toLowerCase().split(';')[0].trim();
  const spec = TYPES[mime];
  const name = path.basename(String(fileName || '').replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  if (!spec || !name || !spec[1].includes(path.extname(name).toLowerCase())) throw uploadError('file_type_blocked');
  const bytes = Number(size);
  const l = await limits();
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw uploadError('invalid_data');
  if (bytes > maxBytes(spec[0], l)) throw uploadError('upload_too_large', 413);
  let duration = null;
  if (durationSeconds != null && durationSeconds !== '') {
    duration = Number(durationSeconds);
    const max = spec[0] === 'video' ? l.video_max_seconds : spec[0] === 'voice' ? l.voice_max_seconds : 0;
    if (!Number.isSafeInteger(duration) || duration < 1 || !max) throw uploadError('invalid_data');
    if (duration > max) throw uploadError('upload_too_long', 413);
  }
  cleanupPending().catch(() => {});
  const id = randomUUID();
  const key = storage.objectKey('chat', id);
  await query(`INSERT INTO uploaded_media (id, owner_id, scope, scope_id, filename, mime, size, data, storage, object_key, status, duration_seconds)
    VALUES (?, ?, 'chat', ?, ?, ?, ?, NULL, 'r2', ?, 'pending', ?)`, [id, userId, conversationId, name, mime, bytes, key, duration]);
  return {
    media_id: id,
    upload_url: storage.presign('PUT', key, { expires: TICKET_SECONDS, contentType: mime, contentLength: bytes }),
    headers: { 'Content-Type': mime },
    expires_in: TICKET_SECONDS,
  };
}

// Pending (or already confirmed) uploads of this sender in this conversation, as message files.
async function claim({ userId, conversationId, mediaIds }) {
  const ids = [...new Set(mediaIds)];
  const entries = [];
  for (const id of ids) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw uploadError('invalid_data');
    const row = await queryOne(`SELECT id, owner_id, scope, scope_id, filename, mime, size, storage, object_key, status, duration_seconds
      FROM uploaded_media WHERE id = ?`, [id]);
    if (!row || Number(row.owner_id) !== Number(userId) || row.scope !== 'chat' || row.storage !== 'r2'
        || Number(row.scope_id) !== Number(conversationId)) throw uploadError('invalid_data');
    if (row.status === 'pending') {
      const stored = await storage.head(row.object_key);
      if (!stored) throw uploadError('upload_missing', 409);
      const first = stored.size === Number(row.size) ? await storage.getRange(row.object_key, 0, 63) : null;
      if (!first || !magicFor(row.mime)?.(first)) {
        await storage.remove(row.object_key).catch(() => {});
        await query('DELETE FROM uploaded_media WHERE id = ?', [row.id]);
        throw uploadError('file_content_invalid');
      }
      await query("UPDATE uploaded_media SET status = 'ready' WHERE id = ? AND status = 'pending'", [row.id]);
    }
    entries.push({
      media_id: row.id, file_url: `/api/media/${row.id}`, file_name: row.filename, file_type: row.mime,
      file_size: Number(row.size), ...(row.duration_seconds ? { duration_seconds: Number(row.duration_seconds) } : {}),
    });
  }
  return entries;
}

module.exports = { limits, createTicket, claim, cleanupPending, _internal: { magicFor, TYPES, maxBytes } };
