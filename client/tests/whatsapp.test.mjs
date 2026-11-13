import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappLink, whatsappNumber } from '../src/utils/whatsapp.js';

test('Saudi numbers in any common form become the full international number', () => {
  for (const raw of ['0500785596', '500785596', '966500785596', '+966500785596', '00966500785596', '050 078 5596', '+966 50-078-5596']) {
    assert.equal(whatsappNumber(raw), '966500785596', raw);
  }
  assert.equal(whatsappNumber('+201001234567'), '201001234567');
  for (const raw of ['', null, undefined, '123', 'abc', '0'.repeat(20)]) assert.equal(whatsappNumber(raw), '', String(raw));
});

test('the link opens a chat with the ready message, or nothing without a valid number', () => {
  assert.equal(whatsappLink('0500785596'), 'https://wa.me/966500785596');
  assert.equal(whatsappLink('0500785596', 'مرحبا & شكوى'), `https://wa.me/966500785596?text=${encodeURIComponent('مرحبا & شكوى')}`);
  assert.equal(whatsappLink('', 'x'), '');
});
