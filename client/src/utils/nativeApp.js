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
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('src');
    if (fromUrl === 'play' || fromUrl === 'apk') localStorage.setItem(SOURCE_KEY, fromUrl);
    // An app that names its version but not its source (Play 1.2.5 and older) is not the APK
    // remembered from an earlier install: forget that, or it would be asked to update an APK it
    // no longer is (AYK-279).
    else if (/^[0-9][0-9.]{0,15}$/.test(params.get('app') || '')) localStorage.removeItem(SOURCE_KEY);
    return localStorage.getItem(SOURCE_KEY) || '';
  } catch (_) { return ''; }
}

// What the app said when it opened the site THIS time (AYK-280). A required-update screen must
// never rest on what an earlier installation left in this phone's storage: a Play install after
// an APK one was told to "update" an APK it no longer was. Kept for this session only (it survives
// a reload, not a new launch), and only the app's own words (?app= and ?src=) count.
const LAUNCH_KEY = 'ayk_native_launch';
export function thisLaunch() {
  try {
    const params = new URLSearchParams(window.location.search);
    const version = params.get('app');
    if (version && /^[0-9][0-9.]{0,15}$/.test(version)) {
      const source = ['play', 'apk'].includes(params.get('src')) ? params.get('src') : '';
      sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ version, source }));
    }
    const saved = JSON.parse(sessionStorage.getItem(LAUNCH_KEY) || 'null');
    return saved && typeof saved.version === 'string' ? { version: saved.version, source: saved.source || '' } : { version: '', source: '' };
  } catch (_) { return { version: '', source: '' }; }
}

// Capture launch metadata before React/router redirects can drop the query. Otherwise the
// footer, update gate and device report may keep the previous installation's version.
nativeAppVersion();
nativeAppSource();
thisLaunch();

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

// AYK-287: a store app older than the minimum set in the admin settings (app_min_version_android
// or _ios) is stopped the same way, with one button to its store page. This reaches every store
// app that names its version, Google Play 1.2.5 included, so a store update is required for all
// from the site itself, the moment it is published.
const STORE_HOSTS = { android: ['play.google.com'], ios: ['apps.apple.com'] };
function storeLink(value, platform) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && STORE_HOSTS[platform].includes(url.hostname) ? url.href : '';
  } catch (_) { return ''; }
}
export function storeUpdateNeeded(launch, settings, userAgent) {
  if (!launch?.version || launch.source === 'apk') return null;
  const platform = /iPhone|iPad|iPod/i.test(userAgent || '') ? 'ios' : /Android/i.test(userAgent || '') ? 'android' : '';
  if (!platform) return null;
  const minimum = String(settings?.[`app_min_version_${platform}`] || '').trim();
  const url = storeLink(settings?.[platform === 'ios' ? 'app_store_url' : 'google_play_url'], platform);
  if (!/^[0-9][0-9.]{0,15}$/.test(minimum) || !url || atLeast(launch.version, minimum)) return null;
  return { version: minimum, url, store: true };
}
