// The Android app opens the site on /?app=<its version> (AYK-069). Keep it on this device so the
// footer and the devices log can show which app version a phone runs.
const KEY = 'ayk_native_app';

export function nativeAppVersion() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('app');
    if (fromUrl && /^[0-9][0-9.]{0,15}$/.test(fromUrl)) localStorage.setItem(KEY, fromUrl);
    return localStorage.getItem(KEY) || '';
  } catch (_) { return ''; }
}
