import test from 'node:test';
import assert from 'node:assert/strict';
import { adminLocationKey, readAdminLocationState, writeAdminLocationState } from '../src/utils/adminLocationState.js';
const memory = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };
test('admin location context is user scoped and excludes form and record contents', () => {
  const storage = memory();
  writeAdminLocationState(storage, 7, { countryId: 1, regionId: 4, cityId: 9, search: 'حي', scroll: { '1/4/9': 512 }, password: 'never', form: { name_ar: 'draft' } });
  assert.equal(readAdminLocationState(storage, 7).cityId, 9);
  assert.equal(readAdminLocationState(storage, 8).cityId, null);
  assert.doesNotMatch(storage.getItem(adminLocationKey(7)), /password|draft|form/);
});
test('corrupt or unavailable storage and invalid IDs/scroll values fail safely', () => {
  const storage = memory(); storage.setItem(adminLocationKey(7), '{broken');
  assert.equal(readAdminLocationState(storage, 7).cityId, null);
  writeAdminLocationState(storage, 7, { countryId: 1, regionId: -1, cityId: 'Infinity', scroll: { x: -1, y: 55, z: Infinity } });
  const value = readAdminLocationState(storage, 7);
  assert.equal(value.regionId, null); assert.equal(value.cityId, null); assert.deepEqual(value.scroll, { y: 55 });
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.doesNotThrow(() => writeAdminLocationState(blocked, 7, {}));
  assert.equal(readAdminLocationState(blocked, 7).cityId, null);
});
