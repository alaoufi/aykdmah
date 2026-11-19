import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enablePush, pushState, needsHomeScreen } from '../../services/pushService';
import { useAuth } from '../../hooks/useAuth';
import { sendDeviceReport } from '../../utils/deviceReport';

const LATER_KEY = 'ayk_permissions_later';
// "Later" hides the bar for a day, not for good: without notifications calls never ring (AYK-092).
const DAY = 24 * 60 * 60 * 1000;
const later = () => { try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < DAY; } catch (_) { return false; } };

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
  // The outcome of the last tap, said in words: enabled, or not and why.
  const [result, setResult] = useState(null);
  const NAMES = { location: 'permissions.location', media: 'permissions.media', push: 'permissions.notifications' };

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
    setResult({ enabled: ok(value) ? [key] : [], failed: ok(value) ? [] : [key], value });
    setBusy('');
    sendDeviceReport({ force: true }).catch(() => {});
  };
  const allowAll = async () => {
    if (busy) return;
    // Notifications first, while the tap still counts as the user's own action.
    const enabled = []; const failed = []; let last = null;
    for (const key of ['push', 'media', 'location']) {
      if (ok(state[key]) || state[key] === 'unsupported') continue;
      setBusy(key);
      const value = await ASK[key]();
      setState(previous => ({ ...previous, [key]: value }));
      if (ok(value)) enabled.push(key); else { failed.push(key); last = value; }
    }
    setResult({ enabled, failed, value: last, nothing: !enabled.length && !failed.length });
    setBusy('');
    sendDeviceReport({ force: true }).catch(() => {});
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

  const names = keys => keys.map(key => t(NAMES[key])).join('، ');
  const outcome = result && (
    <div role="status" data-testid="permissions-result" className={`text-[13px] font-semibold text-center rounded-card px-3 py-2 ${result.failed.length ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
      {result.nothing && `✓ ${t('permissions.all_enabled')}`}
      {result.enabled.length > 0 && <div>✓ {t('permissions.result_enabled', { names: names(result.enabled) })}</div>}
      {result.failed.length > 0 && <div>✗ {t('permissions.result_failed', { names: names(result.failed) })} {t(result.value === 'failed' ? 'permissions.busy' : 'permissions.blocked')}</div>}
    </div>
  );

  if (variant === 'bar') {
    // iPhone in Safari: calls and messages reach it only from the home-screen app (AYK-092).
    if (user && !hidden && needsHomeScreen()) {
      return (
        <div className="bg-amber-100 text-amber-950 border-b border-amber-300 px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[13px] font-semibold" data-testid="ios-install-bar">
          <span>📲 {t('permissions.ios_install')}</span>
          <button type="button" className="text-amber-900 underline" onClick={() => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch (_) { /* private mode */ } setHidden(true); }}>{t('push.later')}</button>
        </div>
      );
    }
    if (!user || hidden || !checked || done) return null;
    return (
      <div className="bg-primary-soft border-b border-border px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[13px]" data-testid="permissions-bar">
        <span>📍🎤📷🔔 {t(ok(state.push) || state.push === 'unsupported' ? 'permissions.bar' : 'permissions.bar_no_ring')}</span>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={allowAll} data-testid="bar-allow-all">{busy ? '⏳' : `✅ ${t('permissions.allow')}`}</button>
        {outcome && <div className="w-full">{outcome}</div>}
        <button type="button" className="text-fg-muted underline" onClick={() => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch (_) { /* private mode */ } setHidden(true); }}>{t('push.later')}</button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface-alt p-3 space-y-2" data-testid="device-permissions">
      {chip('location', `📍 ${t('permissions.location')}`)}
      {chip('media', `🎤 ${t('permissions.microphone')} · 📷 ${t('permissions.camera')}`)}
      {chip('push', `🔔 ${t('permissions.notifications')}`)}
      {outcome}
      {!result && refused && <p className="text-[12.5px] text-danger m-0 text-center" role="alert" data-testid="permissions-blocked">
        {t(state.media === 'failed' ? 'permissions.busy' : 'permissions.blocked')}</p>}
      {!done && <button type="button" className="btn btn-primary btn-block" disabled={busy !== ''} onClick={allowAll} data-testid="allow-all">
        {busy ? '⏳' : `✅ ${t('permissions.allow')}`}</button>}
    </div>
  );
}
