// AYK-251: remembered signatures must never outlive the token or accept a changed one.
const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-0123456789abcdef0123456789abcdef';
const jsonwebtoken = require('jsonwebtoken');
const env = require('../config/env');
const jwt = require('../utils/jwt');

test('a genuine token verifies repeatedly; a tampered or foreign one never does', () => {
  const token = jwt.sign({ id: 7, role: 'client', auth_version: 0 });
  assert.strictEqual(jwt.verify(token).id, 7);
  assert.strictEqual(jwt.verify(token).id, 7);
  const [h, p, s] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ id: 1, role: 'admin' })).toString('base64url');
  assert.throws(() => jwt.verify(`${h}.${forgedPayload}.${s}`));
  assert.throws(() => jwt.verify(`${h}.${p}.${s.slice(0, -2)}xx`));
  assert.throws(() => jwt.verify(jsonwebtoken.sign({ id: 7, role: 'client' }, 'another-secret-another-secret-another')));
});

test('an expired token is refused even after it was remembered', async () => {
  const token = jsonwebtoken.sign({ id: 9, role: 'provider' }, env.JWT.SECRET, { algorithm: 'HS256', expiresIn: 1 });
  assert.strictEqual(jwt.verify(token).id, 9);
  await new Promise(r => setTimeout(r, 1200));
  assert.throws(() => jwt.verify(token), /expired/);
});
