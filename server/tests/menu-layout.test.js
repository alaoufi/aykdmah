// AYK-410: what the menu order may hold.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (/config\/database$/.test(request)) return { query: async () => [], queryOne: async () => null, transaction: async fn => fn() };
  return original.apply(this, arguments);
};
const { clean } = require('../controllers/menuLayoutController');
Module._load = original;

test('a good layout is kept; the home and this page cannot be hidden', () => {
  const out = clean({ groups: [{ key: 'admin.overview', title: ' عام ', items: ['/admin', '/admin/guide'] }], hidden: ['/admin', '/admin/menu-layout', '/admin/guide'] });
  assert.deepEqual(out, { groups: [{ key: 'admin.overview', title: 'عام', items: ['/admin', '/admin/guide'] }], hidden: ['/admin/guide'] });
});

test('bad layouts are refused', () => {
  assert.equal(clean(null), null);
  assert.equal(clean({ groups: [{ key: 'x', items: ['/admin/a', '/admin/a'] }] }), null, 'a page twice');
  assert.equal(clean({ groups: [{ key: 'x', items: ['https://evil.example'] }] }), null, 'not an admin page');
  assert.equal(clean({ groups: [{ key: '', items: [] }] }), null, 'no key');
  assert.equal(clean({ groups: Array.from({ length: 21 }, (_, i) => ({ key: `g${i}`, items: [] })) }), null, 'too many groups');
});
