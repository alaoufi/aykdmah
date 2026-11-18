import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordChangeRedirect, ADMIN_PASSWORD_PATH, SITE_PASSWORD_PATH } from '../src/utils/passwordGate.js';

const temp = { must_change_password: 1 };
test('an admin session with a generated password stays in the admin area (AYK-272)', () => {
  for (const path of ['/admin', '/admin/users', '/admin/guide', '/admin/settings/x']) {
    assert.equal(passwordChangeRedirect({ ...temp, role: 'admin' }, path), ADMIN_PASSWORD_PATH);
  }
  assert.notEqual(passwordChangeRedirect({ ...temp, role: 'admin' }, '/admin'), '/profile');
});
test('the admin password page itself is reachable', () => {
  assert.equal(passwordChangeRedirect({ ...temp, role: 'admin' }, ADMIN_PASSWORD_PATH), null);
  assert.equal(passwordChangeRedirect({ must_change_password: '1' }, ADMIN_PASSWORD_PATH), null);
});
test('a site session is still sent to its profile page', () => {
  assert.equal(passwordChangeRedirect(temp, '/client'), SITE_PASSWORD_PATH);
  assert.equal(passwordChangeRedirect(temp, '/administrator'), SITE_PASSWORD_PATH);
  assert.equal(passwordChangeRedirect(temp, SITE_PASSWORD_PATH), null);
});
test('no redirect once the password has been replaced', () => {
  for (const value of [0, '0', null, undefined]) {
    assert.equal(passwordChangeRedirect({ must_change_password: value }, '/admin'), null);
    assert.equal(passwordChangeRedirect({ must_change_password: value }, '/client'), null);
  }
  assert.equal(passwordChangeRedirect(null, '/admin'), null);
});
