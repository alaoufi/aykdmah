import test from 'node:test';
import assert from 'node:assert/strict';
import { FORM_FIELDS, hiddenFields, requiredFields, toggleField, toggleRequired } from '../src/data/formFields.js';

test('hidden fields come from the setting, ignoring unknown and core fields', () => {
  assert.deepEqual([...hiddenFields({ request: ['title', 'voice'] }, 'request')], ['title', 'voice']);
  assert.deepEqual([...hiddenFields('{"request":["title","category","location","nope"]}', 'request')], ['title']);
  for (const bad of [null, undefined, '', 'not json', '{"request":"title"}', {}]) assert.equal(hiddenFields(bad, 'request').size, 0);
  assert.equal(hiddenFields({ request: ['title'] }, 'other').size, 0);
});

test('a field toggles between hidden and shown, and core fields never hide', () => {
  let setting = {};
  setting = toggleField(setting, 'request', 'title');
  assert.deepEqual(setting, { request: ['title'] });
  setting = toggleField(setting, 'request', 'voice');
  assert.deepEqual(setting.request.sort(), ['title', 'voice']);
  setting = toggleField(setting, 'request', 'title');
  assert.deepEqual(setting.request, ['voice']);
  assert.deepEqual(toggleField(setting, 'request', 'category').request, ['voice']);
  assert.deepEqual(toggleField(setting, 'request', 'location').request, ['voice']);
  assert.ok(FORM_FIELDS.request.filter(field => field.core).every(field => ['category', 'location'].includes(field.key)));
});

test('the account type change hides coverage and service mode but never the professions', () => {
  assert.deepEqual([...hiddenFields({ account_type: ['coverage', 'location_mode', 'professions'] }, 'account_type')], ['coverage', 'location_mode']);
  assert.deepEqual(toggleField({}, 'account_type', 'professions'), { account_type: [] });
});

test('required fields: chosen per form, never hidden ones, and coverage by default', () => {
  assert.deepEqual([...requiredFields(undefined, {}, 'account_type')], ['coverage']);
  assert.equal(requiredFields(undefined, {}, 'request').size, 0);
  assert.deepEqual([...requiredFields({ request: ['title', 'voice', 'category'] }, {}, 'request')], ['title', 'voice']);
  assert.deepEqual([...requiredFields({ request: ['title', 'voice'] }, { request: ['voice'] }, 'request')], ['title']);
  assert.deepEqual(toggleRequired(undefined, 'request', 'title'), { account_type: ['coverage'], request: ['title'] });
  assert.deepEqual(toggleRequired({ request: ['title'] }, 'request', 'title'), { request: [] });
  assert.deepEqual(toggleRequired({}, 'account_type', 'location_mode'), { account_type: [] });
});
