import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_RECOVERY_KEY, isChunkLoadError, recoverFromChunkFailure,
  reloadFreshShell, installChunkRecovery,
} from '../src/utils/chunkRecovery.js';

const chunkError = new TypeError("'text/html' is not a valid JavaScript MIME type.");
function fixture() {
  const storage = new Map();
  const replacements = [];
  const listeners = new Map();
  return {
    storage, replacements, listeners,
    target: {
      navigator: { onLine: true },
      sessionStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
      },
      document: { querySelector: () => ({ content: 'build-one' }) },
      location: { href: 'https://example.test/services/13?city=9&q=plumbing#details', replace: value => replacements.push(value) },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: name => listeners.delete(name),
      localStorage: { getItem: () => { throw new Error('Auth storage must remain untouched'); }, clear: () => { throw new Error('Auth storage must remain untouched'); } },
    },
  };
}

test('module load recovery recognizes Safari MIME failures and other chunk failures only', () => {
  for (const error of [
    chunkError, '“text/html” is not a valid JavaScript MIME type.', 'Failed to fetch dynamically imported module: https://example.test/assets/old.js',
    'Importing a module script failed.', 'Loading chunk 19 failed.',
    'Failed to load module script: https://example.test/assets/old.js',
    'Failed to load module script: Expected a JavaScript module but received MIME type text/html',
    'Unable to preload CSS for /assets/old.css',
  ]) assert.equal(isChunkLoadError(error), true, String(error));
  for (const error of [null, 'Failed to fetch', 'Invalid password', 'Unexpected token < in JSON', 'Cannot read properties of null']) {
    assert.equal(isChunkLoadError(error), false, String(error));
  }
  assert.equal(isChunkLoadError({ toString: () => { throw new Error('Invalid rejection'); } }), false);
});

test('automatic refresh is limited by build version and tab budget while preserving the current route', () => {
  const { target, storage, replacements } = fixture();
  assert.equal(recoverFromChunkFailure(chunkError, { window: target }), true);
  const url = new URL(replacements[0]);
  assert.equal(url.pathname, '/services/13');
  assert.equal(url.searchParams.get('city'), '9');
  assert.equal(url.searchParams.get('q'), 'plumbing');
  assert.equal(url.hash, '#details');
  assert.match(url.searchParams.get('_aykdmh_refresh'), /^\d+$/);
  assert.equal(recoverFromChunkFailure(chunkError, { window: target }), false);
  assert.equal(recoverFromChunkFailure(chunkError, { window: target, version: 'build-two' }), true);
  assert.equal(recoverFromChunkFailure(chunkError, { window: target, version: 'build-three' }), false);
  assert.equal(replacements.length, 2);
  assert.deepEqual([...storage.keys()], [ASSET_RECOVERY_KEY]);
  assert.equal(JSON.parse(storage.get(ASSET_RECOVERY_KEY)).attempts.length, 2);
});

test('offline, broken tab storage and unrelated application errors never trigger automatic refresh', () => {
  const offline = fixture();
  offline.target.navigator.onLine = false;
  assert.equal(recoverFromChunkFailure(chunkError, { window: offline.target }), false);
  assert.equal(offline.replacements.length, 0);
  assert.equal(offline.storage.size, 0);
  const denied = fixture();
  denied.target.sessionStorage.setItem = () => { throw new Error('Storage unavailable'); };
  assert.equal(recoverFromChunkFailure(chunkError, { window: denied.target }), false);
  assert.equal(denied.replacements.length, 0);
  const malformed = fixture();
  malformed.storage.set(ASSET_RECOVERY_KEY, '{invalid');
  assert.equal(recoverFromChunkFailure(chunkError, { window: malformed.target }), false);
  const ordinary = fixture();
  assert.equal(recoverFromChunkFailure(new Error('Invalid credentials'), { window: ordinary.target }), false);
  assert.equal(ordinary.storage.size, 0);
});

test('the early recovery guard is reused and explicit retry bypasses automatic limits', () => {
  const { target, storage, replacements } = fixture();
  const accepted = [];
  target.__AYK_ASSET_RECOVERY__ = {
    recover: error => { accepted.push(error); return true; },
    reloadFresh: () => { accepted.push('manual'); return true; },
  };
  assert.equal(recoverFromChunkFailure(chunkError, { window: target }), true);
  assert.equal(accepted[0], chunkError);
  assert.equal(reloadFreshShell({ window: target }), true);
  assert.equal(accepted[1], 'manual');
  assert.equal(storage.size, 0);
  assert.equal(replacements.length, 0);
});

test('the early wrapper can call the shared implementation without delegating back into itself', () => {
  const { target, storage, replacements } = fixture();
  let delegated = 0;
  target.__AYK_ASSET_RECOVERY__ = {
    recover: () => { delegated += 1; throw new Error('Recursive recovery delegate'); },
    reloadFresh: () => { delegated += 1; throw new Error('Recursive reload delegate'); },
  };
  const options = { window: target, version: 'wrapped-build', skipEarlyDelegate: true };
  assert.equal(recoverFromChunkFailure(chunkError, options), true);
  assert.equal(replacements.length, 1);
  assert.equal(JSON.parse(storage.get(ASSET_RECOVERY_KEY)).attempts[0].version, 'wrapped-build');
  assert.equal(recoverFromChunkFailure(chunkError, options), false);
  assert.equal(reloadFreshShell(options), true);
  assert.equal(replacements.length, 2);
  assert.equal(delegated, 0);
});

test('Vite preload failures are handled only when recovery is accepted and listeners can be removed', () => {
  const { target, listeners, replacements } = fixture();
  const remove = installChunkRecovery({ window: target });
  let prevented = 0;
  const preload = { payload: chunkError, preventDefault: () => { prevented += 1; } };
  listeners.get('vite:preloadError')(preload);
  assert.equal(prevented, 1);
  assert.equal(replacements.length, 1);
  listeners.get('vite:preloadError')(preload);
  assert.equal(prevented, 1);
  listeners.get('error')({ error: new Error('General render failure') });
  listeners.get('unhandledrejection')({ reason: new Error('General network failure') });
  assert.equal(replacements.length, 1);
  remove();
  assert.equal(listeners.size, 0);
});

test('fresh shell cleanup unregisters only this application’s service worker', async () => {
  const { target, replacements } = fixture();
  const unregistered = [];
  target.navigator.serviceWorker = {
    getRegistrations: async () => [
      { scope: 'https://example.test/', active: { scriptURL: 'https://example.test/sw.js' }, unregister: async () => unregistered.push('app') },
      { scope: 'https://example.test/another/', active: { scriptURL: 'https://example.test/another/sw.js' }, unregister: async () => unregistered.push('other') },
      { scope: 'https://other.test/', active: { scriptURL: 'https://other.test/sw.js' }, unregister: async () => unregistered.push('external') },
      { scope: 'https://example.test/embedded/', active: { scriptURL: 'https://example.test/sw.js' }, unregister: async () => unregistered.push('subscope') },
    ],
  };
  assert.equal(reloadFreshShell({ window: target }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unregistered, ['app']);
  assert.equal(replacements.length, 1);
});
