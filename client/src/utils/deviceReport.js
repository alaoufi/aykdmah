// Devices and what they can do (AYK-062): the system, browser and capabilities of this
// device, sent to the server at most twice a day (and after a new site version) so problems
// can be studied per operating system. No personal data; the device key is random.
import api from '../services/api';
import { nativeAppVersion } from './nativeApp';

const KEY = 'ayk_device_key';
const SENT = 'ayk_device_report';

function deviceKey() {
  try {
    let key = localStorage.getItem(KEY);
    if (!key) { key = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64); localStorage.setItem(KEY, key); }
    return key;
  } catch (_) { return 'no-storage'; }
}

// System and browser from the user agent (good enough to group devices).
export function describeDevice(ua = navigator.userAgent) {
  const pick = (re) => (ua.match(re) || [])[1] || null;
  let os = 'other', osVersion = null;
  if (/HarmonyOS/i.test(ua)) { os = 'harmonyos'; osVersion = pick(/HarmonyOS[ /]?([\d.]+)/i); }
  else if (/Android/i.test(ua)) { os = 'android'; osVersion = pick(/Android ([\d.]+)/i); }
  else if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { os = 'ios'; osVersion = (pick(/OS (\d+[_\d]*) like Mac OS X/i) || pick(/Version\/([\d.]+)/i) || '').replace(/_/g, '.') || null; }
  else if (/Windows/i.test(ua)) { os = 'windows'; osVersion = pick(/Windows NT ([\d.]+)/i); }
  else if (/Mac OS X/i.test(ua)) { os = 'macos'; osVersion = (pick(/Mac OS X ([\d_]+)/i) || '').replace(/_/g, '.') || null; }
  else if (/Linux/i.test(ua)) os = 'linux';
  let browser = 'other', browserVersion = null;
  const browsers = [
    ['huawei', /HuaweiBrowser\/([\d.]+)/i], ['samsung', /SamsungBrowser\/([\d.]+)/i], ['edge', /Edg[A-Z]?\/([\d.]+)/i],
    ['opera', /OPR\/([\d.]+)/i], ['firefox', /(?:Firefox|FxiOS)\/([\d.]+)/i], ['chrome', /(?:Chrome|CriOS)\/([\d.]+)/i],
    ['safari', /Version\/([\d.]+).*Safari/i],
  ];
  for (const [name, re] of browsers) { const m = ua.match(re); if (m) { browser = name; browserVersion = m[1]; break; } }
  return { os, os_version: osVersion?.slice(0, 20) || null, browser, browser_version: browserVersion?.split('.').slice(0, 2).join('.') || null };
}

async function permission(name) {
  try { return (await navigator.permissions?.query({ name }))?.state || 'unknown'; } catch (_) { return 'unknown'; }
}

export async function sendDeviceReport({ force = false } = {}) {
  const version = import.meta.env.VITE_APP_VERSION || '';
  try {
    const last = JSON.parse(localStorage.getItem(SENT) || 'null');
    if (!force && last && last.version === version && last.app === nativeAppVersion() && Date.now() - last.at < 12 * 3600 * 1000) return;
  } catch (_) { /* send anyway */ }
  let subscription = null;
  try { subscription = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription(); } catch (_) { subscription = null; }
  let pushHost = null;
  try { pushHost = subscription ? new URL(subscription.endpoint).host : null; } catch (_) { pushHost = null; }
  const report = {
    device_key: deviceKey(),
    ...describeDevice(),
    standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
    push_permission: !('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator) ? 'unsupported' : Notification.permission,
    push_subscribed: Boolean(subscription),
    push_host: pushHost,
    mic_permission: await permission('microphone'),
    camera_permission: await permission('camera'),
    webrtc: typeof RTCPeerConnection === 'function',
    network_type: navigator.connection?.effectiveType || null,
    // Site version, plus the Android app version when it runs inside the app (AYK-069).
    app_version: nativeAppVersion() ? `${version} · app ${nativeAppVersion()}`.slice(0, 40) : version,
  };
  await api.post('/client-devices', report);
  try { localStorage.setItem(SENT, JSON.stringify({ version, app: nativeAppVersion(), at: Date.now() })); } catch (_) { /* private mode */ }
}
