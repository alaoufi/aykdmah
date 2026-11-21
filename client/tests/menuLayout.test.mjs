// AYK-410: the saved menu order applied to the default menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// menuLayout.js imports React and the API; only its two pure functions are tested here.
const source = fs.readFileSync(new URL('../src/layouts/menuLayout.js', import.meta.url), 'utf8');
const pure = source.slice(source.indexOf('export function applyMenuLayout'), source.indexOf('let cached;'));
const file = path.join(os.tmpdir(), `menuLayout-${process.pid}.mjs`);
fs.writeFileSync(file, pure);
const { applyMenuLayout, toLayout } = await import(pathToFileURL(file).href);
fs.unlinkSync(file);

const defaults = [
  { label: 'a', items: [{ to: '/admin' }, { to: '/admin/x' }] },
  { label: 'b', items: [{ to: '/admin/y' }, { to: '/admin/z' }, { to: '/admin/new' }] },
];

test('no saved order: the default menu', () => {
  assert.equal(applyMenuLayout(defaults, null), defaults);
});

test('groups reordered, a page moved, a group renamed, a page hidden, a new page kept', () => {
  const layout = { groups: [{ key: 'b', title: 'الثانية', items: ['/admin/z', '/admin/x'] }, { key: 'a', title: null, items: ['/admin'] }], hidden: ['/admin/y'] };
  const out = applyMenuLayout(defaults, layout);
  assert.deepEqual(out.map(g => g.key), ['b', 'a']);
  assert.equal(out[0].title, 'الثانية');
  // /admin/y hidden; /admin/new (unknown to the saved order) stays in its own group, at the end.
  assert.deepEqual(out[0].items.map(i => i.to), ['/admin/z', '/admin/x', '/admin/new']);
  assert.deepEqual(out[1].items.map(i => i.to), ['/admin']);
  assert.deepEqual(toLayout(out, new Set(['/admin/y'])), { groups: [{ key: 'b', title: 'الثانية', items: ['/admin/z', '/admin/x', '/admin/new'] }, { key: 'a', title: null, items: ['/admin'] }], hidden: ['/admin/y'] });
});

test('a custom group, and an emptied group is left out', () => {
  const layout = { groups: [{ key: 'custom-1', title: 'جديدة', items: ['/admin/y', '/admin/z', '/admin/new'] }, { key: 'a', items: ['/admin', '/admin/x'] }, { key: 'b', items: [] }], hidden: [] };
  const out = applyMenuLayout(defaults, layout);
  assert.deepEqual(out.map(g => g.key), ['custom-1', 'a']);
});
