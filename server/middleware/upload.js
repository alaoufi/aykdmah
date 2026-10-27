const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const { ALLOWED_FILE_TYPES, ALLOWED_EXTENSIONS } = require('../config/constants');
const { generateSafeFilename, ensureDir } = require('../utils/fileHelper');
const { validateUpload, uploadHeaderAllowed } = require('../utils/uploadValidation');

// Requests are capped at 4 MB. Leave room for multipart fields and headers,
// and bound the combined buffers, not each file.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_FILES_BYTES = MAX_REQUEST_BYTES - 256 * 1024;
// Keep private attachments out of the public static uploads directory on every host.
const DATABASE_UPLOADS = true;
const ALL_MIME = [...ALLOWED_FILE_TYPES.IMAGE, ...ALLOWED_FILE_TYPES.DOCUMENT, ...ALLOWED_FILE_TYPES.AUDIO];

function uploadError(message, status = 413, i18nKey = 'upload_body_limit') {
  const error = new Error(message);
  error.status = status;
  error.i18nKey = i18nKey;
  return error;
}

function localizeUploadError(req, error) {
  if (error?.i18nKey && req.t) error.message = req.t(error.i18nKey);
  return error;
}

function boundedMemoryStorage() {
  return {
    _handleFile(req, file, cb) {
      const chunks = [];
      let size = 0, failed = false;
      file.stream.on('data', chunk => {
        if (failed) return;
        req.uploadBytes = (req.uploadBytes || 0) + chunk.length;
        if (req.uploadBytes > MAX_FILES_BYTES) {
          failed = true;
          chunks.length = 0;
          cb(uploadError('إجمالي المرفقات يجب أن يكون أقل من 4 ميجابايت'));
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      file.stream.on('error', err => { if (!failed) { failed = true; cb(err); } });
      file.stream.on('end', () => { if (!failed) cb(null, { buffer: Buffer.concat(chunks, size), size }); });
    },
    _removeFile(req, file, cb) { delete file.buffer; cb(null); },
  };
}

function createStorage(subFolder) {
  if (DATABASE_UPLOADS) return boundedMemoryStorage();
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(env.UPLOAD.DIR, subFolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename: (req, file, cb) => cb(null, generateSafeFilename(file.originalname)),
  });
}

function fileFilter(allowedMimes) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return cb(uploadError('امتداد الملف غير مسموح', 400, 'file_ext_blocked'));
    if (!uploadHeaderAllowed(file, allowedMimes)) return cb(uploadError('نوع الملف غير مسموح', 400, 'file_type_blocked'));
    cb(null, true);
  };
}

function createUploader(subFolder, allowedMimes = ALL_MIME, alwaysMemory = false) {
  const bounded = DATABASE_UPLOADS || alwaysMemory;
  const uploader = multer({
    storage: alwaysMemory ? boundedMemoryStorage() : createStorage(subFolder),
    fileFilter: fileFilter(allowedMimes),
    limits: bounded
      ? { fileSize: MAX_FILES_BYTES, fieldSize: 16 * 1024, fieldNameSize: 100, fields: 16, parts: 32 }
      : { fileSize: env.UPLOAD.MAX_SIZE },
  });
  if (!bounded) return uploader;
  const wrapped = {};
  for (const method of ['single', 'array', 'fields', 'none', 'any']) {
    wrapped[method] = (...args) => {
      const middleware = uploader[method](...args);
      return (req, res, next) => {
        const contentLength = Number(req.headers['content-length']);
        if (contentLength > MAX_REQUEST_BYTES) return next(localizeUploadError(req, uploadError('حجم الطلب يجب أن يكون أقل من 4 ميجابايت')));
        let requestBytes = 0;
        const countBytes = chunk => { requestBytes += chunk.length; };
        req.on('data', countBytes);
        middleware(req, res, err => {
          req.removeListener('data', countBytes);
          if (!err && requestBytes > MAX_REQUEST_BYTES) err = uploadError('حجم الطلب يجب أن يكون أقل من 4 ميجابايت');
          if (err && err instanceof multer.MulterError) {
            err.status = ['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE'].includes(err.code) ? 413 : 400;
            err.i18nKey = err.code === 'LIMIT_FILE_SIZE' ? 'upload_body_limit' : 'invalid_data';
          }
          if (!err) {
            try {
              const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
              for (const file of files) validateUpload(file, allowedMimes);
            } catch (validationError) { err = validationError; }
          }
          if (err) {
            const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
            for (const file of files) delete file.buffer;
          }
          next(localizeUploadError(req, err));
        });
      };
    };
  }
  return wrapped;
}

module.exports = {
  uploadRequest: createUploader('requests', [...ALLOWED_FILE_TYPES.IMAGE, ...ALLOWED_FILE_TYPES.DOCUMENT]),
  uploadChat: createUploader('chat', [...ALL_MIME, ...ALLOWED_FILE_TYPES.VIDEO]),
  uploadReview: createUploader('reviews', ALLOWED_FILE_TYPES.IMAGE),
  uploadVoice: createUploader('voices', ALLOWED_FILE_TYPES.AUDIO),
  uploadAvatar: createUploader('avatars', ALLOWED_FILE_TYPES.IMAGE),
  uploadDispute: createUploader('disputes', ALL_MIME),
  uploadAd: createUploader('ads', [...ALLOWED_FILE_TYPES.IMAGE, ...ALLOWED_FILE_TYPES.IMAGE_ANIMATED, ...ALLOWED_FILE_TYPES.VIDEO], true),
  MAX_REQUEST_BYTES,
  MAX_FILES_BYTES,
};
