// AYK-279: nobody stays on an old copy of the site. The owner's phone kept showing an old release
// for hours: the silent switch (UpdateBar) only happens while the app is out of sight and still
// running, and an app that is swiped away and reopened starts again from the old saved copy.
//
// At every launch this compares the saved copy with the server (/version.json). If it is older,
// it waits a few seconds for the new copy to finish saving, then reloads once, before the
// person has done anything. If the reload still shows the old copy (the saved copy is stuck),
// it removes the saved copy and loads straight from the server. At most two reloads per launch,
// only in the first seconds, never while something is being typed.

const CURRENT = import.meta.env.VITE_APP_VERSION || '';
const TRIES = 'ayk_fresh_tries';
const WINDOW_MS = 12000;

const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);

function busy() {
  const el = document.activeElement;
  const typing = ['INPUT', 'TEXTAREA'].includes(el?.tagName) && el.value;
  return Boolean(typing || document.querySelector('[role="dialog"][aria-modal="true"]'));
}

async function newCopySaved(registration) {
  await registration.update().catch(() => {});
  const worker = registration.installing || registration.waiting;
  if (!worker) return;
  await new Promise(resolve => {
    const check = () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); };
    worker.addEventListener('statechange', check);
    check();
  });
}

async function dropSavedCopy() {
  const registrations = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
  await Promise.all(registrations.map(r => r.unregister().catch(() => {})));
  if ('caches' in window) {
    const names = await caches.keys().catch(() => []);
    // Only the site's own files; nothing of the account lives in these caches.
    await Promise.all(names.filter(n => /workbox|precache|assets|public-images/.test(n)).map(n => caches.delete(n).catch(() => {})));
  }
}

export async function freshStart({ now = () => Date.now(), reload = () => window.location.reload() } = {}) {
  if (!CURRENT || typeof window === 'undefined' || navigator.onLine === false) return 'skip';
  const started = now();
  let tries = 0;
  try { tries = Number(sessionStorage.getItem(TRIES)) || 0; } catch (_) { return 'skip'; }

  let server = null;
  try {
    const res = await withTimeout(fetch('/version.json', { cache: 'no-store' }), 4000);
    server = res?.ok ? (await res.json())?.version : null;
  } catch (_) { /* offline or blocked: keep what we have */ }
  if (!server || server === CURRENT) {
    try { sessionStorage.removeItem(TRIES); } catch (_) { /* private mode */ }
    return 'current';
  }
  if (tries >= 2) return 'gave-up';

  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (tries === 1 || !registration) await dropSavedCopy();
  else await withTimeout(newCopySaved(registration), 8000);

  if (now() - started > WINDOW_MS || busy() || document.hidden) return 'later';
  try { sessionStorage.setItem(TRIES, String(tries + 1)); } catch (_) { return 'skip'; }
  reload();
  return 'reloaded';
}
