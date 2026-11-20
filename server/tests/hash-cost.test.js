const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { hashPassword, comparePassword, needsRehash, warm } = require('../utils/hash');

// AYK-327: new hashes are made at cost 10; a hash kept at a higher cost still signs in and is
// marked to be re-made.
test('new hashes use cost 10, verify, and are not marked for re-making', async () => {
  await warm();
  const hash = await hashPassword('1234');
  assert.match(hash, /^ayk-sha256:\$2[aby]\$10\$/);
  assert.equal(await comparePassword('1234', hash), true);
  assert.equal(await comparePassword('1235', hash), false);
  assert.equal(needsRehash(hash), false);
});

test('a hash at the older cost 12 still verifies and is marked for re-making; other text is not', async () => {
  const digest = require('crypto').createHash('sha256').update('1234', 'utf8').digest('base64');
  const old = 'ayk-sha256:' + bcrypt.hashSync(digest, 12);
  assert.equal(await comparePassword('1234', old), true);
  assert.equal(needsRehash(old), true);
  assert.equal(needsRehash(bcrypt.hashSync('plain', 12)), true, 'a plain bcrypt hash too');
  assert.equal(needsRehash('unused'), false);
  assert.equal(needsRehash(null), false);
});
