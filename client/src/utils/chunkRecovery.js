export const ASSET_RECOVERY_KEY = 'awtad_asset_recovery_v1';
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 2;

export function isChunkLoadError(error) {
  let message;
  try { message = String(error?.message || error || ''); } catch (_) { return false; }
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|ChunkLoadError|Loading (?:CSS )?chunk\b.*failed|Unable to preload CSS for/i.test(message)
    || /text\/html['"\u2018\u2019\u201c\u201d]?\s+is not a valid JavaScript MIME type/i.test(message)
    || /(?:module|JavaScript)[\s\S]*MIME[\s\S]*text\/html/i.test(message);
}

function browser(options) {
  return options.window || globalThis.window;
}

function currentVersion(target, options) {
  return String(options.version || target.document?.querySelector('meta[name="awtad-build"]')?.content || 'unknown');
}

function claimRecovery(target, options) {
  const now = Date.now();
  const version = currentVersion(target, options);
  try {
    const raw = target.sessionStorage.getItem(ASSET_RECOVERY_KEY);
    const state = raw ? JSON.parse(raw) : { attempts: [] };
    if (!state || !Array.isArray(state.attempts) || state.attempts.some(item =>
      !item || typeof item.version !== 'string' || typeof item.at !== 'number' || !Number.isFinite(item.at))) return false;
    const attempts = state.attempts.filter(item => item.at > now - RECOVERY_WINDOW_MS);
    if (attempts.length >= MAX_RECOVERY_ATTEMPTS || attempts.some(item => item.version === version)) return false;
    attempts.push({ version, at: now });
    target.sessionStorage.setItem(ASSET_RECOVERY_KEY, JSON.stringify({ attempts }));
    return true;
  } catch (_) {
    // Without a persistent tab guard, an automatic reload could repeat forever.
    return false;
  }
}

function releaseRootServiceWorker(target) {
  const serviceWorker = target.navigator?.serviceWorker;
  if (typeof serviceWorker?.getRegistrations !== 'function') return null;
  const origin = new URL(target.location.href).origin;
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, 1500); });
  const unregister = Promise.resolve().then(() => serviceWorker.getRegistrations()).then(registrations =>
    Promise.all(registrations.filter(registration => {
      const worker = registration.active || registration.waiting || registration.installing;
      if (!worker?.scriptURL) return false;
      try {
        const url = new URL(worker.scriptURL, origin);
        const scope = new URL(registration.scope, origin);
        return url.origin === origin && url.pathname === '/sw.js' && scope.origin === origin && scope.pathname === '/';
      } catch (_) { return false; }
    }).map(registration => registration.unregister()))).catch(() => {});
  return Promise.race([unregister, timeout]).finally(() => clearTimeout(timer));
}

// This is also the explicit Retry action. It keeps the current route, search
// and fragment, and leaves sign-in data and private API caches untouched.
export function reloadFreshShell(options = {}) {
  const target = browser(options);
  if (!target?.location) return false;
  const earlyRecovery = target.__AWTAD_ASSET_RECOVERY__;
  if (!options.skipEarlyDelegate && typeof earlyRecovery?.reloadFresh === 'function') {
    try { return earlyRecovery.reloadFresh() !== false; } catch (_) { return false; }
  }
  try {
    const url = new URL(target.location.href);
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    url.searchParams.set('_awtad_refresh', String(Date.now()));
    const replace = () => target.location.replace(url.href);
    const cleanup = releaseRootServiceWorker(target);
    if (cleanup) cleanup.then(replace);
    else replace();
    return true;
  } catch (_) { return false; }
}

export function recoverFromChunkFailure(error, options = {}) {
  const target = browser(options);
  if (!target || target.navigator?.onLine === false || !isChunkLoadError(error)) return false;
  const earlyRecovery = target.__AWTAD_ASSET_RECOVERY__;
  if (!options.skipEarlyDelegate && typeof earlyRecovery?.recover === 'function') {
    try { return earlyRecovery.recover(error) === true; } catch (_) { return false; }
  }
  return claimRecovery(target, options) ? reloadFreshShell(options) : false;
}

export function installChunkRecovery(options = {}) {
  const target = browser(options);
  if (typeof target?.addEventListener !== 'function') return () => {};
  const onError = event => recoverFromChunkFailure(event.error || event.message, options);
  const onRejection = event => recoverFromChunkFailure(event.reason, options);
  const onPreloadError = event => {
    if (recoverFromChunkFailure(event.payload, options)) event.preventDefault();
  };
  target.addEventListener('error', onError, true);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    target.removeEventListener('error', onError, true);
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('vite:preloadError', onPreloadError);
  };
}
