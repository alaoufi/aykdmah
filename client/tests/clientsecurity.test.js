import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: {} });

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
globalThis.window = new EventTarget();
window.location = { pathname: '/profile', href: '' };
const deletedCaches = [];
globalThis.caches = { delete: async name => { deletedCaches.push(name); return true; } };
const output = await build({
  stdin: {
    resolveDir: new URL('../src/', import.meta.url).pathname,
    contents: `
      export * from './utils/urlSafety.js';
      export * from './utils/localize.js';
      export { formatDistance } from './utils/formatters.js';
      export { distanceKm, openInExternalMaps } from './utils/geo.js';
      export { default as api, getToken, setToken, apiError } from './services/api.js';
      export * from './services/authService.js';
      export { AuthProvider, useAuth } from './context/AuthContext.jsx';
      export { default as MessageBubble } from './components/chat/MessageBubble.jsx';
      export { default as Avatar } from './components/common/Avatar.jsx';
      export { default as SafeHtml } from './components/common/SafeHtml.jsx';
      export { canReadRequestOffers } from './pages/RequestDetailsPage.jsx';
    `,
  },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'shared-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-i18next|react-router-dom|axios)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const client = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

function adapterResult(config, data = {}) { return { config, data, status: 200, statusText: 'OK', headers: {} }; }
function unauthorized(config) {
  return Object.assign(new Error('Unauthorized'), { config, response: { status: 401, data: { message: 'Unauthorized' }, config } });
}

test('URLs reject executable, credentialed and browser-ambiguous destinations', () => {
  const rejected = [null, {}, 123, '', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'data:text/html,<script>x</script>', 'blob:https://example.org/id', 'https://user:pass@example.org', 'https://%75ser@example.org', 'https:\\evil.example', ' https://example.org', 'https://example.org/ x', 'https://example.org/\nfoo', '/x\u007f', '/x\u0085', 'ftp://example.org/x'];
  rejected.forEach(url => assert.equal(client.safeUrl(url), '', String(url)));
  assert.equal(client.safeUrl('/media/requests/file.pdf?download=1'), '/media/requests/file.pdf?download=1');
  assert.equal(client.safeUrl('HTTPS://example.org/a%20b'), 'https://example.org/a%20b');
});

test('request offer visibility admits providers, the owner and permitted administrators only', () => {
  const request = { id: 7, client_id: 1 };
  assert.equal(client.canReadRequestOffers(null, request), false);
  assert.equal(client.canReadRequestOffers({ id: 2, role: 'client' }, request), false);
  assert.equal(client.canReadRequestOffers({ id: 2, role: 'client' }, request, true), false);
  assert.equal(client.canReadRequestOffers({ id: 1, role: 'client' }, request), true);
  assert.equal(client.canReadRequestOffers({ id: 2, role: 'provider' }, request), true);
  assert.equal(client.canReadRequestOffers({ id: 2, role: 'admin' }, request), false);
  assert.equal(client.canReadRequestOffers({ id: 2, role: 'admin' }, request, true), true);
  assert.equal(client.canReadRequestOffers({ id: 1, role: 'client' }, null), false);
});

test('chat attachment and avatar rendering never retains executable URLs; zero coordinates work', () => {
  const html = renderToStaticMarkup(createElement(client.MessageBubble, { message: {
    created_at: '2026-01-01', message_type: 'location', latitude: 0, longitude: 0,
    files: [{ id: 1, file_url: 'javascript:alert(1)', file_name: 'malicious.pdf', file_type: 'application/pdf' },
      { id: 2, file_url: '/media/chat/valid.png', file_name: 'photo', file_type: 'image/png' }],
  } }));
  assert.doesNotMatch(html, /javascript:|malicious\.pdf/);
  assert.match(html, /destination=0,0/);
  assert.match(html, /src="\/media\/chat\/valid\.png"/);
  const avatar = renderToStaticMarkup(createElement(client.Avatar, { src: 'data:image/svg+xml,<svg onload=x>', name: 'A Person' }));
  assert.doesNotMatch(avatar, /<img|data:/);
  assert.match(avatar, /AP/);
});

test('policy renderer retains formatting and discards executable nodes and every attribute', () => {
  const text = value => ({ nodeType: 3, textContent: value });
  const element = (tag, children, attributes = {}) => ({ nodeType: 1, tagName: tag, childNodes: children, attributes });
  // DOMParser is browser-provided. Exercise the renderer with its parsed node shape.
  globalThis.DOMParser = class {
    parseFromString() { return { body: { childNodes: [
      element('P', [text('Terms '), element('STRONG', [text('safe')], { onclick: 'alert(1)' })], { style: 'display:none', id: 'clobber' }),
      element('SCRIPT', [text('alert(1)')]), element('SVG', [text('svg')]),
      element('A', [text('label')], { href: 'javascript:alert(1)' }),
    ] } }; }
  };
  const html = renderToStaticMarkup(createElement(client.SafeHtml, { html: '<untrusted>' }));
  assert.equal(html, '<div class=""><p>Terms <strong>safe</strong></p>label</div>');
});

test('cached role/profile data is never used as initial authentication', () => {
  values.set('lsm_auth_session', JSON.stringify({ token: 'forged', user: { role: 'admin', is_super_admin: true } }));
  client.setToken('forged');
  function Reader() { const auth = client.useAuth(); return createElement('span', null, String(auth.user === null) + ':' + auth.hasPermission('users')); }
  assert.equal(renderToStaticMarkup(createElement(client.AuthProvider, null, createElement(Reader))), '<span>true:false</span>');
  assert.equal(values.has('lsm_auth_session'), false);
});

test('logout clears local secrets immediately and sends its captured bearer even on failure', async () => {
  client.setToken('logout-token');
  values.set('lsm_auth_session', 'private-profile');
  let sentConfig;
  client.api.defaults.adapter = async config => { sentConfig = config; throw new Error('offline'); };
  const pending = client.logout();
  assert.equal(client.getToken(), null);
  assert.equal(values.has('lsm_auth_session'), false);
  await pending;
  assert.equal(sentConfig.headers.get('Authorization'), 'Bearer logout-token');
  assert.ok(deletedCaches.includes('api-cache'));
});

test('late unauthorized responses cannot clear a newer session', async () => {
  client.setToken('old-session');
  let release, started;
  const dispatched = new Promise(resolve => { started = resolve; });
  client.api.defaults.adapter = config => new Promise((resolve, reject) => { release = () => reject(unauthorized(config)); started(); });
  const pending = client.api.get('/chat/conversations');
  await dispatched;
  client.setToken('new-session');
  release();
  await assert.rejects(pending);
  assert.equal(client.getToken(), 'new-session');
});

test('a queued API operation captures the initiating account before a session switch', async () => {
  client.setToken('initiating-account');
  let sent;
  client.api.defaults.adapter = async config => { sent = config.headers.get('Authorization'); return adapterResult(config); };
  const pending = client.api.post('/chat/conversations/5/location', { latitude: 0, longitude: 0 });
  client.setToken('replacement-account');
  await pending;
  assert.equal(sent, 'Bearer initiating-account');
});

test('password validation failures keep the login; success discards revoked credentials', async () => {
  client.setToken('password-session');
  client.api.defaults.adapter = async config => { throw unauthorized(config); };
  await assert.rejects(client.changePassword({ current_password: 'wrong', new_password: 'new' }));
  assert.equal(client.getToken(), 'password-session');
  client.api.defaults.adapter = async config => adapterResult(config, { success: true });
  await client.changePassword({ current_password: 'right', new_password: 'new' });
  assert.equal(client.getToken(), null);
});

test('late login cannot restore a session after sign-out', async () => {
  client.setToken(null);
  let release, started;
  const dispatched = new Promise(resolve => { started = resolve; });
  client.api.defaults.adapter = config => config.url === '/auth/login'
    ? new Promise(resolve => { release = () => resolve(adapterResult(config, { data: { token: 'late-token', user: { id: 1 } } })); started(); })
    : Promise.resolve(adapterResult(config));
  const pending = client.login({ identifier: 'user', password: 'pass' });
  await dispatched;
  await client.logout();
  release();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(client.getToken(), null);
});

test('malformed API/localization values and numeric-string distances render safely', () => {
  assert.equal(client.localizedName({ name_translations: { en: { bad: true }, ar: 'اسم' } }, 'en'), 'اسم');
  assert.equal(client.tx({ en: { bad: true }, ar: 'آمن' }, 'en'), 'آمن');
  assert.equal(client.apiError({ response: { data: { message: { bad: true } } } }), 'Something went wrong');
  assert.equal(client.formatDistance('2.5'), '2.5 km');
  assert.equal(client.formatDistance('invalid'), '');
  assert.equal(client.distanceKm({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }), null);
});


test('a new login waits for logout to finish so a late cookie clear cannot erase it', async () => {
  client.setToken('departing-token');
  let release, started;
  const dispatched = new Promise(resolve => { started = resolve; });
  const paths = [];
  client.api.defaults.adapter = config => {
    paths.push(config.url);
    if (config.url === '/auth/logout') return new Promise(resolve => { release = () => resolve(adapterResult(config)); started(); });
    return Promise.resolve(adapterResult(config, { data: { token: 'arriving-token', user: { id: 2 } } }));
  };
  const logout = client.logout();
  await dispatched;
  const login = client.login({ identifier: 'next', password: 'pass' });
  await Promise.resolve();
  assert.deepEqual(paths, ['/auth/logout']);
  release();
  await logout;
  await login;
  assert.deepEqual(paths, ['/auth/logout', '/auth/login']);
  assert.equal(client.getToken(), 'arriving-token');
});

test('unavailable browser storage does not crash login or leave the local token after logout', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); },
    removeItem() { throw new Error('Storage unavailable'); },
  };
  client.setToken('memory-token');
  assert.equal(client.getToken(), 'memory-token');
  client.setToken(null);
  assert.equal(client.getToken(), null);
});
