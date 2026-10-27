const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const env = require('../config/env');

function generateSafeFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return `${uuid()}${ext}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function deleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const root = fs.realpathSync(env.UPLOAD.DIR);
      const real = fs.realpathSync(filePath);
      if (!real.startsWith(root + path.sep) || fs.lstatSync(filePath).isSymbolicLink()) return false;
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function publicUrlFor(relativePath) {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  const normalized = String(relativePath).replace(/\\/g, '/');
  if (normalized.split('/').includes('..') || /[\x00-\x1f\x7f]/.test(normalized)) return null;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

module.exports = { generateSafeFilename, ensureDir, deleteFile, publicUrlFor };
