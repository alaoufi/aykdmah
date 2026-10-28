import api from './api';

// Incoming-call notifications on this device (AYK-008), through the browser's own push service.
export const pushSupported = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// iPhone/iPad deliver web notifications only to the app added to the home screen.
export const needsHomeScreen = () => typeof navigator !== 'undefined'
  && /iPhone|iPad|iPod/.test(navigator.userAgent)
  && !(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);

const keyBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

const registration = async () => (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.ready;

// 'unsupported' | 'denied' | 'off' | 'on'
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try { return (await (await registration())?.pushManager.getSubscription()) ? 'on' : 'off'; }
  catch (_) { return 'off'; }
}

async function subscription() {
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { key } = (await api.get('/push/key')).data.data || {};
  if (!key) throw Object.assign(new Error('push_unavailable'), { code: 'push_unavailable' });
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
}

// Must run from a tap: browsers only show the permission prompt for a user gesture.
export async function enablePush() {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await api.post('/push/subscribe', { subscription: (await subscription()).toJSON() });
  return 'on';
}

// After sign-in on a device that already allowed notifications, link it to this account.
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  const existing = await reg?.pushManager.getSubscription();
  if (existing) await api.post('/push/subscribe', { subscription: existing.toJSON() });
}

// Before sign-out, so the device stops ringing for this account.
export async function detachPush() {
  if (!pushSupported()) return;
  try {
    const existing = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (existing) await api.post('/push/unsubscribe', { endpoint: existing.endpoint });
  } catch (_) { /* signing out must not fail because of notifications */ }
}
