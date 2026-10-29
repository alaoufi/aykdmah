import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enablePush, pushState } from '../../services/pushService';
import { useAuth } from '../../hooks/useAuth';

const LATER_KEY = 'ayk_permissions_later';
const later = () => { try { return localStorage.getItem(LATER_KEY) === '1'; } catch (_) { return false; } };

// One tap right after sign-up asks for everything the site needs (AYK-047): the
// location, the microphone and camera (one prompt), and notifications. Kept simple:
// a single button, then a tick beside each permission.
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

// variant 'card' (sign-up, profile) or 'bar' (top of every page while something is missing).
export default function DevicePermissions({ variant = 'card' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(variant === 'bar' && later());
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState({ location: 'prompt', media: 'prompt', push: 'off' });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    Promise.all([permissionState('geolocation'), permissionState('microphone'), pushState().catch(() => 'unsupported')])
      .then(([location, media, push]) => { setState({ location, media, push }); setChecked(true); });
  }, []);
  const ok = value => value === 'granted' || value === 'on';
  const done = ok(state.location) && ok(state.media) && (ok(state.push) || state.push === 'unsupported');

  const allowAll = async () => {
    setBusy(true);
    // Notifications first, while the tap still counts as the user's own action.
    let push = state.push;
    if (!ok(push) && push !== 'unsupported') { try { push = await enablePush(); } catch (_) { push = 'failed'; } }
    const media = ok(state.media) ? state.media : await askMedia();
    const location = ok(state.location) ? state.location : await askLocation();
    setState({ location, media, push });
    setTried(true);
    setBusy(false);
  };

  const tick = (value, label) => (
    <span className={`text-[13px] ${ok(value) ? 'text-success font-bold' : 'text-fg-muted'}`}>{ok(value) ? '✓' : '○'} {label}</span>
  );

  if (variant === 'bar') {
    if (!user || hidden || !checked || done) return null;
    return (
      <div className="bg-primary-soft border-b border-border px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[13px]" data-testid="permissions-bar">
        <span>📍🎤📷🔔 {t('permissions.bar')}</span>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={allowAll} data-testid="bar-allow-all">{busy ? '…' : `✅ ${t('permissions.allow')}`}</button>
        {tried && !done && <span className="w-full text-center text-danger" role="alert">{t(state.media === 'failed' ? 'permissions.busy' : 'permissions.blocked')}</span>}
        <button type="button" className="text-fg-muted underline" onClick={() => { try { localStorage.setItem(LATER_KEY, '1'); } catch (_) { /* private mode */ } setHidden(true); }}>{t('push.later')}</button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface-alt p-3 space-y-2" data-testid="device-permissions">
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {tick(state.location, `📍 ${t('permissions.location')}`)}
        {tick(state.media, `🎤 ${t('permissions.microphone')} · 📷 ${t('permissions.camera')}`)}
        {tick(state.push, `🔔 ${t('permissions.notifications')}`)}
      </div>
      {tried && !done && (
        <p className="text-[12.5px] text-danger m-0 text-center" role="alert" data-testid="permissions-blocked">
          {t(state.media === 'failed' ? 'permissions.busy' : 'permissions.blocked')}
        </p>
      )}
      {!done && <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={allowAll} data-testid="allow-all">
        {busy ? '…' : `✅ ${t('permissions.allow')}`}</button>}
    </div>
  );
}
