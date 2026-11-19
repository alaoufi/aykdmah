// AYK-279: nobody stays on an old copy of the site. The owner's phone kept showing an old release
// for hours: the silent switch (UpdateBar) only happens while the app is out of sight and still
// running, and an app that is swiped away and reopened starts again from the old saved copy.
//
// At every launch this compares the saved copy with the server (/version.json).
//
// AYK-323 (the owner: «يحدث أكثر من مرة، المفروض التحديث صامت»): the check now runs BEFORE the
// page is drawn (main.jsx waits for it), so the person never sees the page and then a reload.
// - The server answers within 0.8 s that the copy is current, or does not answer: draw at once.
//   A late answer never reloads a page already on screen; UpdateBar switches while out of sight.
// - The copy is older: nothing of the old copy is drawn. The new copy is fetched (up to 6 s; if it
//   is not ready by then the saved copy is dropped so the reload comes straight from the server),
//   then one reload. A second reload only if that one still showed the old copy.

const CURRENT = import.meta.env.VITE_APP_VERSION || '';
const TRIES = 'ayk_fresh_tries';
const WINDOW_MS = 12000;

const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);

// The server's version, asked once for start-up and the update bar together (AYK-282: it was
// asked twice in the first second). A fresh question after 10 s.
let asked = null;
export function serverVersion() {
  if (asked && Date.now() - asked.at < 10000) return asked.promise;
  const promise = withTimeout(fetch('/version.json', { cache: 'no-store' }), 4000)
    .then(res => (res?.ok ? res.json() : null)).then(v => v?.version || null).catch(() => null);
  asked = { at: Date.now(), promise };
  return promise;
}

function busy() {
  const el = document.activeElement;
  const typing = ['INPUT', 'TEXTAREA'].includes(el?.tagName) && el.value;
  // A required-update screen is not something to lose: it must never hold back the site's own
  // update (AYK-292: an old copy's update screen kept the new copy, which removes it, from loading).
  return Boolean(typing || document.querySelector('[role="dialog"][aria-modal="true"]:not([data-testid="app-update-gate"])'));
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

  // The page waits for this, so the question may take 0.8 s at most.
  const server = await withTimeout(serverVersion(), 800);
  if (!server) return 'unknown';
  if (server === CURRENT) {
    try { sessionStorage.removeItem(TRIES); } catch (_) { /* private mode */ }
    return 'current';
  }
  if (tries >= 2) return 'gave-up';

  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (tries === 1 || !registration) await dropSavedCopy();
  else if (!await withTimeout(newCopySaved(registration).then(() => true), 6000)) await dropSavedCopy();

  if (now() - started > WINDOW_MS || busy()) return 'later';
  try { sessionStorage.setItem(TRIES, String(tries + 1)); } catch (_) { return 'skip'; }
  reload();
  return 'reloaded';
}
