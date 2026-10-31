import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CURRENT = import.meta.env.VITE_APP_VERSION || '';

// Resolves once a new service worker (if any) has finished installing and taken over, or after 60 s.
async function newVersionReady() {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  await registration.update().catch(() => {});
  const worker = registration.installing || registration.waiting;
  if (!worker) return;
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 60000);
    const check = () => { if (['activated', 'redundant'].includes(worker.state)) { clearTimeout(timer); resolve(); } };
    worker.addEventListener('statechange', check);
    check();
  });
}

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
        .then(v => {
          if (!v?.version || v.version === CURRENT) return;
          setAvailable(true);
          // Start downloading it now, so "Update now" is quick.
          navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
        }).catch(() => {});
    };
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  const update = async () => {
    setBusy(true);
    try { await newVersionReady(); } catch (_) { /* reload anyway */ }
    window.location.reload();
  };

  // Updates install on their own everywhere (AYK-074; the app since AYK-073): no call or dialog on
  // screen and nothing being typed; otherwise try again on the next check (return, or 15 s).
  useEffect(() => {
    if (!available || busy) return undefined;
    const tryNow = () => {
      if (document.hidden) return;
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && document.activeElement.value;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') || typing) return;
      update();
    };
    tryNow();
    const timer = setInterval(tryNow, 15000);
    document.addEventListener('visibilitychange', tryNow);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tryNow); };
  }, [available, busy]);

  // Only the short "Updating…" line is ever shown.
  if (!busy) return null;
  // A clear window over everything while it updates (AYK-105), not a line at the top.
  return (
    <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/45 backdrop-blur-sm px-6" role="status" aria-live="polite" data-testid="update-bar">
      {busy ? (
        <div className="w-full max-w-xs rounded-[22px] bg-surface shadow-card p-6 text-center" data-testid="update-progress">
          <span className="mx-auto mb-3 block w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" aria-hidden="true" />
          <div className="text-[17px] font-extrabold text-fg">🔄 {t('update.in_progress')}</div>
          <p className="text-[13.5px] text-fg-muted mt-2 mb-0 leading-relaxed">{t('update.in_progress_hint')}</p>
        </div>
      ) : (
        <>
          <span>✨ {t('update.available')}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={update}>🔄 {t('update.now')}</button>
        </>
      )}
    </div>
  );
}
