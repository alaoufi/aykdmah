// AYK-500: regression tests for the three hardening fixes from the full security review.
const test = require('node:test');
const assert = require('node:assert/strict');

test('logger: line breaks in user text cannot forge a second log line', () => {
  const lines = [];
  const original = console.log; console.log = (...args) => lines.push(args.join(' '));
  try { require('../utils/logger').info('user typed:\nINFO fake line\r\nand more'); } finally { console.log = original; }
  assert.equal(lines.length, 1);
  assert.ok(!/[\r\n]/.test(lines[0]));
});

test('seo pageFor: a path of thousands of slashes is answered quickly (no regex blow-up)', async () => {
  const seo = require('../services/seoService');
  const started = Date.now();
  try { await seo.pageFor('/' + '/'.repeat(50000) + 'x' + '/'.repeat(50000)); } catch (_) { /* no database in a unit test */ }
  assert.ok(Date.now() - started < 1500);
});
