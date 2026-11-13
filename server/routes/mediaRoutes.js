const express = require('express');
const UploadedMedia = require('../models/UploadedMedia');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

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
