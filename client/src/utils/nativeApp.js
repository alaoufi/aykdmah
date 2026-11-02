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

// Where the app was installed from (AYK-148), sent by app 1.3.1 and later as ?src=: "play" (Google
// Play updates it, and forces its own updates) or "apk" (downloaded from aykdmh.com/dl).
const SOURCE_KEY = 'ayk_native_src';
export function nativeAppSource() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('src');
    if (fromUrl === 'play' || fromUrl === 'apk') localStorage.setItem(SOURCE_KEY, fromUrl);
    return localStorage.getItem(SOURCE_KEY) || '';
  } catch (_) { return ''; }
}

// The app's own call engine (AYK-145), from app 1.3.0 on Android: calls run like phone calls
// (earpiece, proximity sensor, Bluetooth, in the background). The site hands the call over.
export const atLeast = (version, wanted) => {
  const a = String(version).split('.').map(Number);
  const b = wanted.split('.').map(Number);
  for (let i = 0; i < b.length; i += 1) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
  return true;
};
export function nativeCallsSupported() {
  const version = nativeAppVersion();
  return Boolean(version) && /Android/i.test(navigator.userAgent || '') && atLeast(version, '1.3.0');
}
export function openNativeCall({ id, userId, key, video, name, code, incoming }) {
  const query = new URLSearchParams({ user: String(userId), key, type: video ? 'video' : 'audio', name: name || '', code: code || '', dir: incoming ? 'in' : 'out' });
  window.location.href = `intent://call/${id}?${query}#Intent;scheme=aykdmhcall;package=sa.aykdmh.app;end`;
}
