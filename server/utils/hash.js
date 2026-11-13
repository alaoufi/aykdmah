const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 10;
const PREFIX = 'ayk-sha256:';
const digest = password => crypto.createHash('sha256').update(password, 'utf8').digest('base64');

async function hashPassword(password) {
  if (typeof password !== 'string' || Array.from(password).length < 4 || Array.from(password).length > 100) {
    throw new TypeError('Password must contain 6 to 100 characters');
  }
  // bcrypt consumes only the first 72 UTF-8 bytes. Prehash new passwords so
  // the entire accepted password contributes, including long Unicode input.
  return PREFIX + await bcrypt.hash(digest(password), SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string' || Buffer.byteLength(password, 'utf8') > 4096) return false;
  if (hash.startsWith(PREFIX)) return bcrypt.compare(digest(password), hash.slice(PREFIX.length));
  // Existing bcrypt credentials remain valid without modifying any account.
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
