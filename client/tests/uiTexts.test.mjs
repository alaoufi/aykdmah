import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenTexts, matchesText, samePlaceholders, textPlaceholders } from '../src/utils/uiTexts.js';

const ar = JSON.parse(readFileSync(new URL('../src/i18n/locales/ar.json', import.meta.url), 'utf8'));

test('every Arabic text is listed once with its full key', () => {
  const all = flattenTexts(ar);
  assert.equal(new Set(all.map(([key]) => key)).size, all.length);
  assert.deepEqual(all.find(([key]) => key === 'requester.directory_empty'), ['requester.directory_empty', 'لا توجد سجلات في دليلك']);
  assert.deepEqual(flattenTexts({ a: { b: 'x', c: { d: 'y' } }, e: 'z', n: 3 }), [['a.b', 'x'], ['a.c.d', 'y'], ['e', 'z']]);
});

test('an edited text must keep the values and tags the code fills in', () => {
  assert.deepEqual(textPlaceholders('مرحبًا {{name}}، لديك <1>{{ count }}</1>'), ['</1>', '<1>', '{{count}}', '{{name}}']);
  assert.equal(samePlaceholders('{{shown}} من {{total}}', '{{total}} :{{shown}}'), true);
  assert.equal(samePlaceholders('{{shown}} من {{total}}', '{{shown}} فقط'), false);
  assert.equal(samePlaceholders('نص عادي', 'نص {{x}}'), false);
  assert.equal(samePlaceholders('نص عادي', 'نص آخر'), true);
});

test('search finds a text by its words, ignoring Arabic letter forms, or by its key', () => {
  assert.equal(matchesText('دليلك', 'requester.directory_empty', 'لا توجد سجلات في دليلك'), true);
  assert.equal(matchesText('سجلات دليلك', 'x.y', 'لا توجد سجلات في دليلك'), true);
  assert.equal(matchesText('الاداره', 'x.y', 'لوحة الإدارة'), true);
  assert.equal(matchesText('directory_empty', 'requester.directory_empty', 'نص'), true);
  assert.equal(matchesText('غير موجود', 'x.y', 'نص', 'تعديل'), false);
  assert.equal(matchesText('تعديل', 'x.y', 'نص', 'تعديل'), true);
  assert.equal(matchesText('   ', 'x.y', 'نص'), true);
});
