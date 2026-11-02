import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CURRENT = import.meta.env.VITE_APP_VERSION || '';
const UPDATED_FROM = 'ayk_updated_from';

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

// Something the person would lose on a reload: a call or a dialog on screen, or text being typed.
function busyOnScreen() {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && document.activeElement.value;
  return Boolean(typing || document.querySelector('[role="dialog"][aria-modal="true"]'));
}

// Silent site updates (AYK-053, AYK-074, AYK-148): compares this build's version with the one on
// the server (/version.json, written at build time) when the app opens or comes back to the
// screen, and every 5 minutes. A new version downloads in the background while the person keeps
// working, and is switched to only while the app is out of sight (they left it or locked the
// phone), so they never see a reload; opening the app again shows the new version, with a small
// note of its number for a few seconds that blocks nothing.
export default function UpdateBar() {
  const { t } = useTranslation();
  const available = useRef(false);
  const switching = useRef(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let from = null;
    try { from = sessionStorage.getItem(UPDATED_FROM); sessionStorage.removeItem(UPDATED_FROM); } catch (_) { /* private mode */ }
    if (!CURRENT || !from || from === CURRENT) return undefined;
    setUpdated(true);
    const timer = setTimeout(() => setUpdated(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!CURRENT) return undefined;
    const switchWhenHidden = async () => {
      if (!available.current || switching.current || !document.hidden || busyOnScreen()) return;
      switching.current = true;
      try { await newVersionReady(); } catch (_) { /* reload anyway */ }
      if (document.hidden && !busyOnScreen()) {
        try { sessionStorage.setItem(UPDATED_FROM, CURRENT); } catch (_) { /* private mode */ }
        window.location.reload();
      } else switching.current = false;
    };
    const check = () => {
      if (document.hidden) { switchWhenHidden(); return; }
      fetch('/version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        .then(v => {
          if (!v?.version || v.version === CURRENT) return;
          available.current = true;
          // Download it now, so switching takes no time.
          navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
        }).catch(() => {});
    };
    check();
    const timer = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  if (!updated) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[4000] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite" data-testid="update-done">
      <span className="rounded-full bg-fg text-surface shadow-card px-4 py-2 text-[13px] font-bold">
        ✅ {t('update.done')} <span dir="ltr">{CURRENT}</span>
      </span>
    </div>
  );
}
