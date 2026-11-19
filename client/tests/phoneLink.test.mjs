import test from 'node:test';
import assert from 'node:assert/strict';
import { plainPhone, telLink } from '../src/utils/phoneLink.js';

test('a typed number becomes a tel: link; anything else is refused', () => {
  assert.equal(plainPhone('+966 50 123-4567'), '+966501234567');
  assert.equal(plainPhone('(050) 123.4567'), '0501234567');
  assert.equal(plainPhone('٠٥٠١٢٣٤٥٦٧'), '0501234567');
  assert.equal(telLink('0501234567'), 'tel:0501234567');
  for (const bad of ['', '12345', 'abc', '05012345678901234567', 'javascript:alert(1)', '050 123 4567 ext 2', '+']) assert.equal(telLink(bad), '', bad);
});
