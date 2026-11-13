import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/components/admin/confirmAdminChange.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*/gm, '').replaceAll('export async function', 'async function').replaceAll('export function', 'function');
test('cancelled admin changes remain cancelled and concurrent double taps do not queue another action', async () => {
  let answer, calls = 0;
  const fn = vm.runInNewContext(`${source}; confirmAdminChange`, { getToken: () => 'same-session', askConfirm: () => { calls++; return new Promise(resolve => { answer = resolve; }); } });
  const first = fn(key => key, 'Target');
  assert.equal(await fn(key => key), false);
  assert.equal(calls, 1);
  answer(false); assert.equal(await first, false);
  const next = fn(key => key); answer(true); assert.equal(await next, true); assert.equal(calls, 2);
});

test('confirmation cannot authorize an action after navigation or a session switch', async () => {
  let answer, token = 'first';
  const window = { location: { pathname: '/admin/users', search: '' } };
  const fn = vm.runInNewContext(`${source}; confirmAdminChange`, {
    window, getToken: () => token, askConfirm: () => new Promise(resolve => { answer = resolve; }),
  });
  const moved = fn(key => key); window.location.pathname = '/admin/categories'; answer(true);
  assert.equal(await moved, false);
  const switched = fn(key => key); token = 'second'; answer(true);
  assert.equal(await switched, false);
});

test('leaving and returning to the same URL never revives an unmounted form confirmation', async () => {
  let answer;
  const window = { location: { pathname: '/admin/users', search: '' } };
  const fn = vm.runInNewContext(`${source}; confirmAdminChange`, {
    window, getToken: () => 'same-token', askConfirm: () => new Promise(resolve => { answer = resolve; }),
  });
  const lifetime = new AbortController();
  const pending = fn(key => key, '', false, { signal: lifetime.signal });
  window.location.pathname = '/admin/categories'; lifetime.abort();
  window.location.pathname = '/admin/users'; answer(true);
  assert.equal(await pending, false);
});

test('the mounted caller hook invalidates a captured confirmation on navigation cleanup', async () => {
  let answer, setup, ref;
  const window = { location: { pathname: '/admin/users', search: '' }, addEventListener() {}, removeEventListener() {} };
  const hook = vm.runInNewContext(`${source}; useAdminConfirmation`, {
    window, AbortController, TOKEN_CHANGE_EVENT: 'ayk:session-change', ADMIN_TOKEN_KEY: 'lsm_admin_token',
    getToken: () => 'same-token', askConfirm: () => new Promise(resolve => { answer = resolve; }),
    useRef: value => ref || (ref = { current: value }), useEffect: callback => { setup = callback; },
    useLocation: () => ({ key: 'entry-one', ...window.location }),
  });
  const confirm = hook(), cleanup = setup();
  const pending = confirm(key => key);
  cleanup(); // Router navigation or component unmount runs the actual hook cleanup.
  hook(); setup(); // Returning mounts/sets up a fresh lifetime at the same URL.
  answer(true);
  assert.equal(await pending, false);
});
