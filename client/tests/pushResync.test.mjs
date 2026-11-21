// AYK-386: notifications allowed once stay on: a lost subscription (a new release drops the site's
// worker) is made again silently, without asking the person again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/services/pushService.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*/gm, '').replaceAll('export ', '');

function load({ permission, existing = null }) {
  const posts = []; let asked = 0; let subscribed = 0;
  const sub = { toJSON: () => ({ endpoint: 'https://push.example/x' }) };
  const reg = { pushManager: { getSubscription: async () => existing, subscribe: async () => { subscribed++; return sub; } } };
  const context = vm.createContext({
    window: { location: { href: 'https://aykdmh.com/' }, history: { replaceState() {}, state: null }, PushManager: function () {}, Notification: {} },
    navigator: { serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg }, userAgent: 'Android' },
    Notification: { permission, requestPermission: async () => { asked++; return 'granted'; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL, atob: s => Buffer.from(s, 'base64').toString('binary'), Uint8Array, setTimeout, Promise,
    api: { get: async () => ({ data: { data: { key: 'BAAA' } } }), post: async (path, body) => { posts.push([path, body]); return { data: {} }; } },
  });
  vm.runInContext(source, context);
  return { context, posts, counts: () => ({ asked, subscribed }) };
}

test('allowed before, subscription lost: made again without asking', async () => {
  const { context, posts, counts } = load({ permission: 'granted', existing: null });
  assert.equal(await vm.runInContext('syncPush()', context), 'on');
  assert.deepEqual(counts(), { asked: 0, subscribed: 1 });
  assert.equal(posts[0][0], '/push/subscribe');
});

test('allowed and still subscribed: linked to the account, nothing new', async () => {
  const existing = { toJSON: () => ({ endpoint: 'https://push.example/old' }) };
  const { context, posts, counts } = load({ permission: 'granted', existing });
  assert.equal(await vm.runInContext('syncPush()', context), 'on');
  assert.deepEqual(counts(), { asked: 0, subscribed: 0 });
  assert.equal(posts[0][1].subscription.endpoint, 'https://push.example/old');
});

test('never allowed: nothing happens and nobody is asked', async () => {
  const { context, posts, counts } = load({ permission: 'default' });
  assert.equal(await vm.runInContext('syncPush()', context), 'off');
  assert.deepEqual(counts(), { asked: 0, subscribed: 0 });
  assert.equal(posts.length, 0);
});
