import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdminCatalogForm, catalogResponseErrors } from '../src/utils/adminCatalogValidation.js';
const t = key => key;
test('category and geographic forms mark missing names and bounded text on the actual fields', () => {
  assert.equal(validateAdminCatalogForm('category', { name_ar: ' ' }, t).name_ar, 'dialog.required');
  for (const kind of ['region', 'city', 'district']) {
    const found = validateAdminCatalogForm(kind, { name_ar: '', name_en: 'a'.repeat(121) }, t);
    assert.equal(found.name_ar, 'dialog.required'); assert.equal(found.name_en, 'promote.err.text_too_long');
  }
  assert.deepEqual(validateAdminCatalogForm('category', { name_ar: 'الكهرباء', sort_order: 0 }, t), {});
});
test('catalog error field/code is safely mapped without attributing an unrelated server diagnostic', () => {
  const error = { response: { data: { errors: [{ field: 'name_ar', code: 'required' }, { field: 'name_en', code: 'too_long' }, { field: 'unrelated', code: 'required', message: 'private' }] } } };
  assert.deepEqual(catalogResponseErrors('district', error, t), { name_ar: 'dialog.required', name_en: 'promote.err.text_too_long' });
});
