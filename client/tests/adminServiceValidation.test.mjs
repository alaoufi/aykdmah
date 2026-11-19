import test from 'node:test';
import assert from 'node:assert/strict';
import { validateServiceForm, serviceResponseErrors } from '../src/utils/adminServiceValidation.js';
const t = key => key;
const valid = { name_ar: 'خدمة تجريبية', category_id: 5, base_price: '', sort_order: 0 };
test('new subservice marks required and invalid fields before sending any mutation', () => {
  assert.deepEqual(validateServiceForm(valid, t), {});
  const errors = validateServiceForm({ ...valid, name_ar: ' ', category_id: '', base_price: '-1', sort_order: 1.2 }, t);
  assert.equal(errors.name_ar, 'dialog.required'); assert.equal(errors.category_id, 'dialog.required');
  assert.equal(errors.base_price, 'wallet.errors.invalid_amount'); assert.equal(errors.sort_order, 'errors.invalid_data');
  assert.equal(validateServiceForm({ ...valid, name_ar: 'a'.repeat(151) }, t).name_ar, 'promote.err.text_too_long');
});
test('server field/code reasons map only to known inputs without exposing arbitrary diagnostic text', () => {
  const errors = serviceResponseErrors({ response: { data: { errors: [
    { field: 'name_ar', code: 'required' }, { field: 'base_price', code: 'invalid_amount' },
    { field: 'icon', code: 'invalid_data', message: 'private diagnostic' }, { field: 'password', code: 'required' },
  ] } } }, t);
  assert.deepEqual(errors, { name_ar: 'dialog.required', base_price: 'wallet.errors.invalid_amount', icon: 'errors.invalid_data' });
  assert.deepEqual(serviceResponseErrors({ response: { data: { errors: {} } } }, t), {});
});
