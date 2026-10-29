import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enablePush, pushState } from '../../services/pushService';
import { useAuth } from '../../hooks/useAuth';

const LATER_KEY = 'ayk_permissions_later';
const later = () => { try { return localStorage.getItem(LATER_KEY) === '1'; } catch (_) { return false; } };

// The site's permissions (AYK-047): location, microphone and camera, notifications.
// Each one is a button: a tap asks for it, shows that it is working, then turns into
// "✓ Enabled"; if it is ever switched off, it shows as tappable again.
async function permissionState(name) {
  try { return (await navigator.permissions?.query({ name }))?.state || 'prompt'; }
  catch (_) { return 'prompt'; }
}

const askLocation = () => new Promise(resolve => {
  if (!navigator.geolocation) { resolve('unsupported'); return; }
  navigator.geolocation.getCurrentPosition(() => resolve('granted'), error => resolve(error?.code === 1 ? 'denied' : 'failed'), { timeout: 15000 });
});

async function askMedia() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
    stream.getTracks().forEach(track => track.stop());
    return 'granted';
  } catch (err) { return err?.name === 'NotAllowedError' ? 'denied' : 'failed'; }
}

async function askPush() {
  try { return await enablePush(); } catch (_) { return 'failed'; }
}

const ASK = { location: askLocation, media: askMedia, push: askPush };

// variant 'card' (sign-up, profile) or 'bar' (top of every page while something is missing).
export default function DevicePermissions({ variant = 'card' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(variant === 'bar' && later());
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState({ location: 'prompt', media: 'prompt', push: 'off' });
  const [busy, setBusy] = useState('');

  // Read the current state, also when the user comes back to the page (a permission
  // switched off in the browser shows as tappable again).
  const refresh = useCallback(() => Promise.all([permissionState('geolocation'), permissionState('microphone'), pushState().catch(() => 'unsupported')])
    .then(([location, media, push]) => { setState({ location, media, push }); setChecked(true); }), []);
  useEffect(() => {
    refresh();
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [refresh]);

  const ok = value => value === 'granted' || value === 'on';
  const done = ok(state.location) && ok(state.media) && (ok(state.push) || state.push === 'unsupported');
  const refused = Object.values(state).some(value => value === 'denied' || value === 'failed');

  const ask = async key => {
    if (busy) return;
    setBusy(key);
    const value = await ASK[key]();
    setState(previous => ({ ...previous, [key]: value }));
    setBusy('');
  };
  const allowAll = async () => {
    if (busy) return;
    // Notifications first, while the tap still counts as the user's own action.
    for (const key of ['push', 'media', 'location']) {
      if (ok(state[key]) || state[key] === 'unsupported') continue;
      setBusy(key);
      const value = await ASK[key]();
      setState(previous => ({ ...previous, [key]: value }));
    }
    setBusy('');
  };

  const chip = (key, label) => {
    const value = state[key];
    const on = ok(value);
    const bad = value === 'denied' || value === 'failed';
    if (value === 'unsupported') return null;
    return (
      <button key={key} type="button" onClick={() => ask(key)} disabled={busy !== ''} data-testid={`perm-${key}`} aria-pressed={on}
        className={`flex items-center justify-between gap-2 w-full px-3 py-2.5 rounded-card border-2 text-[14px] font-semibold transition active:scale-[.98] ${
          on ? 'border-success bg-success-soft text-success' : bad ? 'border-danger text-danger bg-surface' : 'border-primary bg-surface text-fg'}`}>
        <span>{label}</span>
        <span className="text-[13px]">
          {busy === key ? '⏳' : on ? `✓ ${t('permissions.enabled')}` : t('permissions.tap_to_enable')}
        </span>
      </button>
    );
  };

  if (variant === 'bar') {
    if (!user || hidden || !checked || done) return null;
    return (
      <div className="bg-primary-soft border-b border-border px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[13px]" data-testid="permissions-bar">
        <span>📍🎤📷🔔 {t('permissions.bar')}</span>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={allowAll} data-testid="bar-allow-all">{busy ? '⏳' : `✅ ${t('permissions.allow')}`}</button>
        {refused && <span className="w-full text-center text-danger" role="alert">{t(state.media === 'failed' ? 'permissions.busy' : 'permissions.blocked')}</span>}
        <button type="button" className="text-fg-muted underline" onClick={() => { try { localStorage.setItem(LATER_KEY, '1'); } catch (_) { /* private mode */ } setHidden(true); }}>{t('push.later')}</button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface-alt p-3 space-y-2" data-testid="device-permissions">
      {chip('location', `📍 ${t('permissions.location')}`)}
      {chip('media', `🎤 ${t('permissions.microphone')} · 📷 ${t('permissions.camera')}`)}
      {chip('push', `🔔 ${t('permissions.notifications')}`)}
      {refused && <p className="text-[12.5px] text-danger m-0 text-center" role="alert" data-testid="permissions-blocked">
        {t(state.media === 'failed' ? 'permissions.busy' : 'permissions.blocked')}</p>}
      {!done && <button type="button" className="btn btn-primary btn-block" disabled={busy !== ''} onClick={allowAll} data-testid="allow-all">
        {busy ? '⏳' : `✅ ${t('permissions.allow')}`}</button>}
    </div>
  );
}
