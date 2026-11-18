import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function launch(search, entries = []) {
  const values = new Map(entries);
  globalThis.window = { location: { search } };
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const session = new Map();
  globalThis.sessionStorage = {
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
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

// AYK-280: the owner installed 1.3.6 from aykdmh.com/dl, then 1.2.5 from Google Play, and the
// site stopped him with "update the app": it trusted the source the APK had left in storage.
test('a Play app that names no source is not taken for an APK left in storage', async () => {
  const { api, values } = await launch('?app=1.2.5', [['ayk_native_app', '1.3.6'], ['ayk_native_src', 'apk']]);
  assert.deepEqual(api.thisLaunch(), { version: '1.2.5', source: '' });
  assert.equal(values.has('ayk_native_src'), false);
  assert.equal(api.nativeAppVersion(), '1.2.5');
});

test('this launch counts only what the app sent now, and survives route changes', async () => {
  const { api } = await launch('?app=1.3.2&src=apk', [['ayk_native_src', 'play']]);
  assert.deepEqual(api.thisLaunch(), { version: '1.3.2', source: 'apk' });
  const opened = await launch('', [['ayk_native_app', '1.3.2'], ['ayk_native_src', 'apk']]);
  assert.deepEqual(opened.api.thisLaunch(), { version: '', source: '' });
});

// AYK-287: the minimum app version from the admin settings sends older store apps to the store.
test('a store app below the minimum set in the settings is sent to its store', async () => {
  const { api } = await launch('');
  const android = 'Mozilla/5.0 (Linux; Android 12; HBP-LX9) Chrome/130 Mobile';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148';
  const settings = { app_min_version_android: '1.3.8', google_play_url: 'https://play.google.com/store/apps/details?id=sa.aykdmh.app',
    app_min_version_ios: '', app_store_url: '' };
  assert.deepEqual(api.storeUpdateNeeded({ version: '1.2.5', source: '' }, settings, android),
    { version: '1.3.8', url: 'https://play.google.com/store/apps/details?id=sa.aykdmh.app', store: true });
  assert.equal(api.storeUpdateNeeded({ version: '1.3.8', source: 'play' }, settings, android), null);
  assert.equal(api.storeUpdateNeeded({ version: '1.4.0', source: 'play' }, settings, android), null);
  // The downloaded APK keeps its own update screen; the website and an empty minimum stop nobody.
  assert.equal(api.storeUpdateNeeded({ version: '1.2.5', source: 'apk' }, settings, android), null);
  assert.equal(api.storeUpdateNeeded({ version: '', source: '' }, settings, android), null);
  assert.equal(api.storeUpdateNeeded({ version: '1.0.0', source: '' }, settings, iphone), null);
  assert.equal(api.storeUpdateNeeded({ version: '1.2.5', source: '' }, { ...settings, app_min_version_android: '' }, android), null);
  // Never a link outside the store.
  assert.equal(api.storeUpdateNeeded({ version: '1.2.5', source: '' }, { ...settings, google_play_url: 'https://evil.test/' }, android), null);
});
