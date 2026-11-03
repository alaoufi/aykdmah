import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function launch(search, entries = []) {
  const values = new Map(entries);
  globalThis.window = { location: { search } };
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const api = await import(`../src/utils/nativeApp.js?startup=${++sequence}`);
  // Router navigation can happen before the footer or device reporter reads the version.
  window.location.search = '';
  return { api, values };
}

test('captures the upgraded native version and install source before route navigation', async () => {
  const { api, values } = await launch('?app=1.3.4&src=apk', [
    ['ayk_native_app', '1.3.2'], ['ayk_native_src', 'play'], ['lsm_token', 'keep-session'],
  ]);
  assert.equal(api.nativeAppVersion(), '1.3.4');
  assert.equal(api.nativeAppSource(), 'apk');
  assert.equal(values.get('lsm_token'), 'keep-session');
});

test('ordinary page launches retain the last known native metadata', async () => {
  const { api } = await launch('?city=1', [['ayk_native_app', '1.3.4'], ['ayk_native_src', 'play']]);
  assert.equal(api.nativeAppVersion(), '1.3.4');
  assert.equal(api.nativeAppSource(), 'play');
});

test('invalid native metadata cannot replace the stored values', async () => {
  const { api } = await launch('?app=invalid&src=untrusted', [['ayk_native_app', '1.3.4'], ['ayk_native_src', 'apk']]);
  assert.equal(api.nativeAppVersion(), '1.3.4');
  assert.equal(api.nativeAppSource(), 'apk');
});

test('startup remains usable when browser storage is blocked', async () => {
  globalThis.window = { location: { search: '?app=1.3.4&src=apk' } };
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const api = await import(`../src/utils/nativeApp.js?startup=${++sequence}`);
  assert.equal(api.nativeAppVersion(), '');
  assert.equal(api.nativeAppSource(), '');
});
