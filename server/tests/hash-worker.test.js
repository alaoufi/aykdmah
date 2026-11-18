// AYK-249: password hashing runs off the main thread, stays compatible with existing hashes.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { hashPassword, comparePassword } = require('../utils/hash');

test('new hashes verify; wrong passwords fail; old plain bcrypt hashes still verify', async () => {
  const hash = await hashPassword('كلمة-مرور-طويلة 2026');
  assert.match(hash, /^ayk-sha256:\$2[aby]\$12\$/);
  assert.strictEqual(await comparePassword('كلمة-مرور-طويلة 2026', hash), true);
  assert.strictEqual(await comparePassword('wrong', hash), false);
  const legacy = await bcrypt.hash('old-password', 10);
  assert.strictEqual(await comparePassword('old-password', legacy), true);
  assert.strictEqual(await comparePassword('x', 'not-a-hash'), false);
});

test('the main thread stays responsive during sign-ins', async () => {
  const hash = await hashPassword('test-password-1');
  let maxGap = 0, last = Date.now();
  const timer = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 1);
  await Promise.all([1, 2, 3, 4].map(() => comparePassword('test-password-1', hash)));
  clearInterval(timer);
  assert.ok(maxGap < 40, `main thread stalled ${maxGap} ms (bcrypt on the main thread stalls ~100 ms at a time)`);
});
