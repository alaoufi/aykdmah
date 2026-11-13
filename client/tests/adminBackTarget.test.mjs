import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBackTarget } from '../src/utils/adminBackTarget.js';
test('a deep link with previous non-app browser entries falls back to the admin dashboard', () => {
  for (const state of [null, {}, { idx: 0 }, { idx: -1 }]) assert.equal(adminBackTarget(state), '/admin');
});
test('ordinary navigation within this router can go back one entry', () => {
  assert.equal(adminBackTarget({ idx: 1 }), -1); assert.equal(adminBackTarget({ idx: 5 }), -1);
});
