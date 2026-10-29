import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enablePush, pushState } from '../../services/pushService';

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

export default function DevicePermissions() {
  const { t } = useTranslation();
  const [state, setState] = useState({ location: 'prompt', media: 'prompt', push: 'off' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([permissionState('geolocation'), permissionState('microphone'), pushState().catch(() => 'unsupported')])
      .then(([location, media, push]) => setState({ location, media, push }));
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
    setBusy(false);
  };

  const tick = (value, label) => (
    <span className={`text-[13px] ${ok(value) ? 'text-success font-bold' : 'text-fg-muted'}`}>{ok(value) ? '✓' : '○'} {label}</span>
  );

  return (
    <div className="rounded-card border border-border bg-surface-alt p-3 space-y-2" data-testid="device-permissions">
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {tick(state.location, `📍 ${t('permissions.location')}`)}
        {tick(state.media, `🎤 ${t('permissions.microphone')} · 📷 ${t('permissions.camera')}`)}
        {tick(state.push, `🔔 ${t('permissions.notifications')}`)}
      </div>
      {!done && <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={allowAll} data-testid="allow-all">
        {busy ? '…' : `✅ ${t('permissions.allow')}`}</button>}
    </div>
  );
}
