// AYK-351 (the owner): short addresses for the apps, to share anywhere.
//   aykdmh.com/app  -> the store of this phone (App Store on iPhone, Google Play on Android);
//                      on a computer, a page with both.
//   aykdmh.com/gl   -> Google Play.        aykdmh.com/ios -> App Store.
// The store links come from the admin settings; these are used only if the settings cannot be read.

export const SHORT_LINKS = { '/app': 'auto', '/gl': 'android', '/ios': 'ios' };
const FALLBACK = {
  google_play_url: 'https://play.google.com/store/apps/details?id=sa.aykdmh.app',
  app_store_url: 'https://apps.apple.com/app/id6829494773',
};
const safe = (value, host) => {
  try { const url = new URL(String(value || '').trim()); return url.protocol === 'https:' && url.hostname === host ? url.href : ''; } catch (_) { return ''; }
};
export const phoneOf = ua => (/iPhone|iPad|iPod/i.test(ua || '') ? 'ios' : /Android/i.test(ua || '') ? 'android' : '');

// Where a short address leads on this device, or '' for the page with both stores.
export function shortLinkTarget(pathname, ua, settings = {}) {
  const kind = SHORT_LINKS[String(pathname || '').replace(/\/+$/, '').toLowerCase()];
  if (!kind) return '';
  const store = kind === 'auto' ? phoneOf(ua) : kind;
  const play = safe(settings.google_play_url, 'play.google.com') || FALLBACK.google_play_url;
  const apple = safe(settings.app_store_url, 'apps.apple.com') || FALLBACK.app_store_url;
  if (store === 'ios') return apple;
  // AYK-351 (the owner: «يحوّل على قوقل بلاي» the web page, whose «open in the Play Store app» did not
  // open): Chrome on Android opens the Play Store app only from a tap, not from a page that sends
  // itself there, so it fell back to the web page. An Android phone gets our page with one big
  // button instead, which opens the Play Store app directly.
  if (store === 'android') return phoneOf(ua) === 'android' ? '' : play;
  return '';
}

// Called first thing at start-up: leaves for the store before anything is drawn.
// Returns true when it is leaving.
export function followShortLink() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (!SHORT_LINKS[path] || shortLinkTarget(path, navigator.userAgent, {}) === '') return false;
  const go = settings => window.location.replace(shortLinkTarget(path, navigator.userAgent, settings || {}));
  const timer = setTimeout(() => go({}), 1500);
  fetch('/api/settings/public').then(r => r.json()).then(body => { clearTimeout(timer); go(body?.data); })
    .catch(() => { clearTimeout(timer); go({}); });
  return true;
}
