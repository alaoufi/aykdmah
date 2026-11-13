const path = require('path');
const { mp4Mime, webmMime, oggMime } = require('./mediaFormat');

const FORMATS = [
  { mime: 'image/png', aliases: ['image/png', 'image/apng'], extensions: ['.png', '.apng'], check: b => b.length >= 24 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.toString('ascii', 12, 16) === 'IHDR' },
  { mime: 'image/jpeg', aliases: ['image/jpeg', 'image/jpg'], extensions: ['.jpg', '.jpeg'], check: b => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', aliases: ['image/webp'], extensions: ['.webp'], check: b => b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { mime: 'image/gif', aliases: ['image/gif'], extensions: ['.gif'], check: b => b.length >= 13 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)) },
  { mime: 'application/pdf', aliases: ['application/pdf'], extensions: ['.pdf'], check: b => b.length >= 8 && /^%PDF-[12]\.\d/.test(b.toString('ascii', 0, 8)) },
  { mime: 'audio/wav', aliases: ['audio/wav'], extensions: ['.wav'], check: b => b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' },
  { mime: 'audio/mpeg', aliases: ['audio/mpeg', 'audio/mp3'], extensions: ['.mp3'], check: b => b.length >= 4 && (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0 && (b[2] & 0xf0) !== 0xf0)) },
  { aliases: ['audio/webm', 'video/webm'], extensions: ['.webm'], detect: webmMime },
  { aliases: ['audio/ogg', 'video/ogg'], extensions: ['.ogg', '.ogv'], detect: oggMime },
  { aliases: ['audio/mp4', 'audio/x-m4a', 'video/mp4', 'video/quicktime'], extensions: ['.mp4', '.m4a', '.mov'], detect: mp4Mime },
];

function missingMime(mime) {
  return mime == null || mime === '' || mime === 'application/octet-stream';
}

function uploadHeaderAllowed(file, allowedMimes) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!missingMime(file.mimetype)) return allowedMimes.includes(file.mimetype);
  // This only lets a supported extension reach the byte check. Shared WebM,
  // Ogg and MP4 containers keep their track kind undecided until inspection.
  return FORMATS.some(format => format.extensions.includes(extension)
    && format.aliases.some(mime => allowedMimes.includes(mime)));
}

function validateUpload(file, allowedMimes) {
  const buffer = file.buffer;
  const extension = path.extname(file.originalname || '').toLowerCase();
  const untyped = missingMime(file.mimetype);
  const format = FORMATS.find(f => (untyped || f.aliases.includes(file.mimetype)) && f.extensions.includes(extension));
  let actualMime;
  try {
    if (Buffer.isBuffer(buffer) && buffer.length && format) actualMime = format.detect ? format.detect(buffer) : format.check(buffer) && format.mime;
  } catch (_) { /* Invalid container lengths/structure become an ordinary input error. */ }
  if (!actualMime || (extension === '.m4a' && !actualMime.startsWith('audio/'))
      || (extension === '.mov' && !actualMime.startsWith('video/'))
      || (allowedMimes && ((!untyped && !allowedMimes.includes(file.mimetype)) || !allowedMimes.includes(actualMime)))) {
    const error = new Error('File content does not match an allowed format');
    error.status = 400;
    error.i18nKey = 'file_content_invalid';
    throw error;
  }
  file.mimetype = actualMime;
  file.originalname = path.basename(String(file.originalname).replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'file';
  return file;
}

module.exports = { validateUpload, uploadHeaderAllowed };
