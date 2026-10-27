const { query, queryOne } = require('../config/database');
const { validateUpload } = require('../utils/uploadValidation');
const { ALLOWED_FILE_TYPES } = require('../config/constants');

async function create({ mime, size, filename, buffer }) {
  const file = validateUpload({ mimetype: mime, originalname: filename, buffer }, [...ALLOWED_FILE_TYPES.IMAGE, ...ALLOWED_FILE_TYPES.IMAGE_ANIMATED, ...ALLOWED_FILE_TYPES.VIDEO]);
  mime = file.mimetype; filename = file.originalname; size = buffer.length;
  const result = await query(
    'INSERT INTO ad_media (mime, size, filename, data) VALUES (?, ?, ?, ?)',
    [mime, size, filename || null, buffer]
  );
  return result.insertId;
}

// Returns { mime, size, data } — used by the streaming endpoint.
async function findById(id) {
  return queryOne('SELECT mime, size, data FROM ad_media WHERE id = ?', [id]);
}

// Returns metadata only (no data column) — for admin lists.
async function metaById(id) {
  return queryOne('SELECT id, mime, size, filename, created_at FROM ad_media WHERE id = ?', [id]);
}

async function remove(id) {
  await query('DELETE FROM ad_media WHERE id = ?', [id]);
}

module.exports = { create, findById, metaById, remove };
