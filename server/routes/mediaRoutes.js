const express = require('express');
const UploadedMedia = require('../models/UploadedMedia');
const storage = require('../services/objectStorage');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
const directUploads = require('../services/directUploads');
const Conversation = require('../models/Conversation');
const { requireMarketplaceWrite } = require('../middleware/verificationPolicy');
const { uploadLimiter } = require('../middleware/rateLimiter');

// AYK-248: the owner's media limits and whether large files go straight to R2 (public: the
// attachment menu shows "up to 3 minutes or 100 MB" before anyone signs in).
router.get('/limits', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await directUploads.limits() });
}));

// POST /api/media/uploads { conversation_id, file_name, type, size, duration_seconds? }
// -> a 15-minute URL the phone PUTs the bytes to; the message then carries media_ids.
router.post('/uploads', authenticate, requireMarketplaceWrite, uploadLimiter, asyncHandler(async (req, res) => {
  const { conversation_id: conversationId, file_name: fileName, type, size, duration_seconds: durationSeconds } = req.body || {};
  if (!/^[1-9][0-9]{0,9}$/.test(String(conversationId || ''))) return res.status(400).json({ success: false, message: req.t('invalid_data') });
  if (!await Conversation.isParticipant(conversationId, req.user.id) || !await Conversation.canSend(conversationId, req.user.id)) {
    return res.status(403).json({ success: false, message: req.t('deny_chat_participant') });
  }
  try {
    const ticket = await directUploads.createTicket({ userId: req.user.id, conversationId: Number(conversationId), fileName, type, size, durationSeconds });
    return res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    if (!err.i18nKey) throw err;
    return res.status(err.status || 400).json({ success: false, message: req.t(err.i18nKey) });
  }
}));

// Browser media requests use the same HttpOnly session cookie as API requests.
// Public avatars/reviews are checked against their current visible parent row.
router.get('/:id', asyncHandler(async (req, res, next) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(404).end();
  const file = await UploadedMedia.findById(req.params.id);
  if (!file) return res.status(404).end();
  req.media = file;
  if (await UploadedMedia.canRead(file)) return next();
  return authenticate(req, res, next);
}), asyncHandler(async (req, res) => {
  const file = req.media;
  if (!await UploadedMedia.canRead(file, req.user)) return res.status(404).end();
  if (file.status && file.status !== 'ready') return res.status(404).end();
  if (file.storage === 'r2') {
    // AYK-248: after the same access check, a 5-minute link straight to the private R2 object.
    // The bytes never pass through this server; R2 answers range requests for audio and video.
    const response = { 'response-content-type': file.mime, 'response-cache-control': 'private, no-store' };
    if (file.mime === 'application/pdf') {
      response['response-content-disposition'] = `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`;
    }
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    return res.redirect(302, storage.presign('GET', file.object_key, { expires: 300, response }));
  }
  res.set({
    'Content-Type': file.mime,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'Accept-Ranges': 'bytes',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (file.mime === 'application/pdf') {
    res.set('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  }
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return res.status(416).set('Content-Range', `bytes */${file.size}`).end();
    const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) return res.status(416).set('Content-Range', `bytes */${file.size}`).end();
    return res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'Content-Length': end - start + 1 }).end(file.data.subarray(start, end + 1));
  }
  return res.set('Content-Length', file.size).end(file.data);
}));

module.exports = router;
