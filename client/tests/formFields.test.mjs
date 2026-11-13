import test from 'node:test';
import assert from 'node:assert/strict';
import { FORM_FIELDS, hiddenFields, toggleField } from '../src/data/formFields.js';

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
