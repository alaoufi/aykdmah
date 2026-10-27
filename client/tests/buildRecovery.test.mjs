import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { copyHashedAssets } from '../build-tools/compatibilityAssets.mjs';
import { earlyRecoveryPlugin, earlyRecoverySource } from '../build-tools/earlyRecovery.mjs';

const generatedSource = earlyRecoverySource();

function browserFixture({ lang = 'ar', online = true, blockedStorage = false, version = 'assets/index-Ab12Cd34.js' } = {}) {
  const listeners = new Map();
  const replacements = [];
  const session = new Map([['session_auth_keep', 'owned-test-value']]);
  const local = new Map([['lsm_lang', lang], ['lsm_token', 'owned-test-token'], ['ryza_theme', 'dark']]);
  const localReads = [];
  let localMutations = 0;
  let cacheMutations = 0;
  const createElement = tag => ({
    tagName: tag.toUpperCase(), childNodes: [], textContent: '', listeners: new Map(),
    append(...children) { this.childNodes.push(...children); },
    appendChild(child) { this.childNodes.push(child); },
    addEventListener(name, listener) { this.listeners.set(name, listener); },
  });
  const root = createElement('div');
  const document = {
    querySelector: selector => selector === 'meta[name="awtad-build"]' ? { content: version } : null,
    getElementById: id => id === 'root' ? root : null,
    createElement,
  };
  const location = {
    href: 'https://example.test/services/12?city=9&q=plumbing#details',
    origin: 'https://example.test',
    replace: value => replacements.push(value),
  };
  const localStorage = {
    getItem(key) { localReads.push(key); return local.get(key) || null; },
    setItem() { localMutations += 1; throw new Error('Local sign-in storage must remain untouched'); },
    removeItem() { localMutations += 1; throw new Error('Local sign-in storage must remain untouched'); },
    clear() { localMutations += 1; throw new Error('Local sign-in storage must remain untouched'); },
  };
  const window = {
    document, location, localStorage,
    navigator: { onLine: online },
    sessionStorage: {
      getItem: key => session.get(key) || null,
      setItem(key, value) {
        if (blockedStorage) throw new Error('Session storage unavailable');
        session.set(key, value);
      },
    },
    addEventListener(name, listener) {
      const group = listeners.get(name) || [];
      group.push(listener); listeners.set(name, group);
    },
    removeEventListener(name, listener) {
      listeners.set(name, (listeners.get(name) || []).filter(candidate => candidate !== listener));
    },
  };
  const caches = {
    delete() { cacheMutations += 1; throw new Error('Private caches must remain untouched'); },
    keys() { cacheMutations += 1; throw new Error('Private caches must remain untouched'); },
  };
  window.caches = caches;
  const context = vm.createContext({ window, document, location, localStorage, caches, URL, setTimeout, clearTimeout });
  const dispatch = (name, event) => {
    for (const listener of [...(listeners.get(name) || [])]) listener(event);
  };
  const moduleError = { target: { tagName: 'SCRIPT', type: 'module', src: 'https://example.test/assets/index-OldBuild.js' } };
  return {
    context, window, dispatch, moduleError, root, replacements, listeners, session, local, localReads,
    mutationCounts: () => ({ local: localMutations, caches: cacheMutations }),
  };
}

test('compatibility archive restores scripts, styles and local model runtimes without overwriting the current release', async t => {
  const owned = await mkdtemp(path.join(tmpdir(), 'awtad-build-recovery-test-'));
  t.after(() => rm(owned, { recursive: true, force: true }));
  const source = path.join(owned, 'archive');
  const destination = path.join(owned, 'current');
  await mkdir(source); await mkdir(destination);
  const valid = ['HomePage-Ab12Cd34.js', 'react-vendor-Ef56Gh78.js', 'index-Jk90Lm_-.css', 'runtime-Ab12Cd34.mjs', 'runtime-Ef56Gh78.wasm'];
  for (const file of valid) await writeFile(path.join(source, file), 'archived:' + file);
  await writeFile(path.join(destination, valid[0]), 'current release stays');
  for (const file of ['app.js', 'index-short.css', 'picture-Ab12Cd34.png', 'runtime.wasm', 'index-Ab12Cd34.js.map']) {
    await writeFile(path.join(source, file), 'excluded');
  }
  await mkdir(path.join(source, 'directory-Ab12Cd34.js'));
  await writeFile(path.join(owned, 'external.js'), 'symlink target stays private');
  await symlink(path.join(owned, 'external.js'), path.join(source, 'linked-Ab12Cd34.js'));

  assert.equal(await copyHashedAssets(source, destination), valid.length - 1);
  assert.deepEqual((await readdir(destination)).sort(), [...valid].sort());
  assert.equal(await readFile(path.join(destination, valid[0]), 'utf8'), 'current release stays');
  for (const file of valid.slice(1)) assert.equal(await readFile(path.join(destination, file), 'utf8'), 'archived:' + file);
  assert.equal(await copyHashedAssets(source, destination), 0);
  assert.equal(await copyHashedAssets(path.join(owned, 'absent'), destination), 0);
});

test('early recovery is a classic pre-module script tagged with the current entry version', async () => {
  const source = await generatedSource;
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'app-recovery.js' }));
  const plugin = earlyRecoveryPlugin();
  const tags = plugin.transformIndexHtml.handler('', { bundle: {
    logo: { type: 'asset', fileName: 'logo.svg' },
    entry: { type: 'chunk', isEntry: true, fileName: 'assets/index-Ab12Cd34.js' },
  } });
  assert.equal(tags[0].tag, 'meta');
  assert.equal(tags[0].attrs.name, 'awtad-build');
  assert.equal(tags[0].attrs.content, 'assets/index-Ab12Cd34.js');
  assert.equal(plugin.transformIndexHtml.handler('', {})[0].attrs.content, 'development');
  const emitted = [];
  await plugin.generateBundle.call({ emitFile: asset => emitted.push(asset) });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].fileName, 'app-recovery.js');
  assert.doesNotThrow(() => new vm.Script(emitted[0].source));
});

test('an entry module failure before React refreshes the same route once through the shared wrapper', async () => {
  const fixture = browserFixture();
  vm.runInContext(await generatedSource, fixture.context);
  const recovery = fixture.window.__AWTAD_ASSET_RECOVERY__;
  assert.equal(recovery.version, 'assets/index-Ab12Cd34.js');
  fixture.dispatch('error', fixture.moduleError);
  assert.equal(fixture.replacements.length, 1);
  const fresh = new URL(fixture.replacements[0]);
  assert.equal(fresh.pathname, '/services/12');
  assert.equal(fresh.searchParams.get('city'), '9');
  assert.equal(fresh.searchParams.get('q'), 'plumbing');
  assert.equal(fresh.hash, '#details');
  assert.match(fresh.searchParams.get('_awtad_refresh'), /^\d+$/);
  assert.equal(fixture.root.childNodes.length, 0);
  assert.equal(recovery.recover(new TypeError("'text/html' is not a valid JavaScript MIME type.")), false);
  fixture.dispatch('unhandledrejection', { reason: new Error('Failed to fetch dynamically imported module') });
  fixture.dispatch('error', fixture.moduleError);
  assert.equal(fixture.replacements.length, 1);
  const listenerCount = [...fixture.listeners.values()].reduce((total, group) => total + group.length, 0);
  vm.runInContext(await generatedSource, fixture.context);
  assert.equal(fixture.window.__AWTAD_ASSET_RECOVERY__, recovery);
  assert.equal([...fixture.listeners.values()].reduce((total, group) => total + group.length, 0), listenerCount);
  assert.equal(fixture.local.get('lsm_token'), 'owned-test-token');
  assert.equal(fixture.session.get('session_auth_keep'), 'owned-test-value');
  assert.deepEqual(fixture.mutationCounts(), { local: 0, caches: 0 });
});

test('the classic error listener recognizes Safari MIME failures without recursion', async () => {
  const fixture = browserFixture();
  vm.runInContext(await generatedSource, fixture.context);
  fixture.dispatch('error', { error: new TypeError("'text/html' is not a valid JavaScript MIME type.") });
  assert.equal(fixture.replacements.length, 1);
  assert.equal(fixture.window.__AWTAD_ASSET_RECOVERY__.reloadFresh(), false);
  assert.equal(fixture.replacements.length, 1);
  assert.deepEqual(fixture.localReads, []);
});

test('offline or blocked session storage shows native fallback without clearing sign-in data', async () => {
  const expectedTitles = {
    ar: 'تعذّر تحميل الموقع', en: 'Unable to load the site', ur: 'سائٹ لوڈ نہیں ہو سکی',
    hi: 'साइट लोड नहीं हो सकी', bn: 'সাইট লোড করা যায়নি',
  };
  for (const lang of Object.keys(expectedTitles)) {
    for (const failure of [{ online: false }, { blockedStorage: true }]) {
      const fixture = browserFixture({ lang, ...failure });
      vm.runInContext(await generatedSource, fixture.context);
      fixture.dispatch('error', fixture.moduleError);
      assert.equal(fixture.replacements.length, 0);
      assert.equal(fixture.root.childNodes.length, 1);
      const [title, body, button] = fixture.root.childNodes[0].childNodes;
      assert.equal(title.textContent, expectedTitles[lang]);
      assert.ok(body.textContent.trim());
      assert.ok(button.textContent.trim());
      assert.equal(fixture.local.get('lsm_token'), 'owned-test-token');
      assert.equal(fixture.local.get('lsm_lang'), lang);
      assert.equal(fixture.local.get('ryza_theme'), 'dark');
      assert.equal(fixture.session.get('session_auth_keep'), 'owned-test-value');
      assert.deepEqual(fixture.mutationCounts(), { local: 0, caches: 0 });
      button.listeners.get('click')();
      assert.equal(fixture.replacements.length, 1);
    }
  }
});

test('external scripts, classic scripts, ordinary app errors and mounted React content are respected', async () => {
  const fixture = browserFixture({ online: false });
  vm.runInContext(await generatedSource, fixture.context);
  fixture.dispatch('error', { target: { tagName: 'SCRIPT', type: 'module', src: 'https://external.test/app.js' } });
  fixture.dispatch('error', { target: { tagName: 'SCRIPT', type: '', src: 'https://example.test/other.js' } });
  fixture.dispatch('error', { error: new Error('Invalid password') });
  assert.equal(fixture.replacements.length, 0);
  assert.equal(fixture.root.childNodes.length, 0);
  fixture.root.appendChild({ textContent: 'Already mounted application' });
  fixture.dispatch('error', fixture.moduleError);
  assert.equal(fixture.root.childNodes.length, 1);
  assert.equal(fixture.root.childNodes[0].textContent, 'Already mounted application');
});

test('the early bootstrap is served without immutable caching and runs before the module entry', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const matchedHeaders = config.headers.filter(rule => new RegExp(`^${rule.source}$`).test('/app-recovery.js'));
  const cacheHeaders = matchedHeaders.flatMap(rule => rule.headers).filter(header => header.key === 'Cache-Control');
  assert.match(cacheHeaders.at(-1)?.value || '', /no-store/);
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="/app-recovery.js"') >= 0);
  assert.ok(html.indexOf('src="/app-recovery.js"') < html.indexOf('type="module"'));
});
