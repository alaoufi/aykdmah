import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBackTarget } from '../src/utils/adminBackTarget.js';

test('the admin back button goes up one level until the admin home', () => {
  assert.equal(adminBackTarget('/admin/support/7'), '/admin/support');
  assert.equal(adminBackTarget('/admin/reports/backups'), '/admin'); // no list page above it
  assert.equal(adminBackTarget('/admin/support'), '/admin');
  assert.equal(adminBackTarget('/admin/support/'), '/admin');
  assert.equal(adminBackTarget('/admin'), '/admin');
});
test('anything unexpected falls back to the admin home', () => {
  for (const value of [null, undefined, '', '/elsewhere/a/b']) assert.equal(adminBackTarget(value), '/admin');
});
