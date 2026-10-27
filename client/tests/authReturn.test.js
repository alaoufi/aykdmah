import test from 'node:test';
import assert from 'node:assert/strict';
import { internalAuthReturn, authReturnTarget, isRequestAuthReturn } from '../src/utils/authReturn.js';

test('an internal request return preserves its selected service query and hash', () => {
  const destination = '/requests/new?service_id=13&city=9&district=35#details';
  assert.equal(internalAuthReturn(destination), destination);
  assert.equal(authReturnTarget('client', destination), destination);
  assert.equal(authReturnTarget('provider', destination), destination);
  assert.equal(isRequestAuthReturn(destination), true);
  assert.equal(isRequestAuthReturn('/services/13?city=9#request'), false);
});

test('external destinations, encoded unsafe paths and auth loops fall back by role', () => {
  for (const destination of [undefined, null, 123, {}, 'https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2f%2fevil.test', '/requests/\nnew', '/%0arequests', '/%zz', 'javascript:alert(1)', '/login?from=/requests/new', '/REGISTER/', '/admin/login', '/a/../login']) {
    assert.equal(internalAuthReturn(destination), null, String(destination));
    assert.equal(authReturnTarget('provider', destination), '/provider', String(destination));
    assert.equal(authReturnTarget('admin', destination), '/admin', String(destination));
    assert.equal(authReturnTarget('client', destination), '/client', String(destination));
  }
  assert.equal(authReturnTarget('client', '/'), '/client');
});

test('a URL value within an internal query does not become the return destination', () => {
  const destination = '/requests/new?note=https%3A%2F%2Fexample.com%2Ftest#part';
  assert.equal(internalAuthReturn(destination), destination);
});
