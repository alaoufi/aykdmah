import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CURRENT = import.meta.env.VITE_APP_VERSION || '';

// "A new version is available" (AYK-053): compares this build's version with the one on the
// server (/version.json, written at build time) when the app opens or comes back to the
// screen, and every 5 minutes. The button fetches the new version and reloads.
export default function UpdateBar() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CURRENT) return undefined;
    const check = () => {
      if (document.hidden) return;
      fetch('/version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        .then(v => { if (v?.version && v.version !== CURRENT) setAvailable(true); }).catch(() => {});
    };
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  const update = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.update();
        // The new worker takes over at once (skipWaiting); wait for it briefly.
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 4000);
          navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    } catch (_) { /* reload anyway */ }
    window.location.reload();
  };

  if (!available) return null;
  return (
    <div className="bg-success-soft border-b border-border px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[13px]" role="status" data-testid="update-bar">
      <span>✨ {t('update.available')}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={update} disabled={busy}>{busy ? '⏳' : `🔄 ${t('update.now')}`}</button>
    </div>
  );
}
