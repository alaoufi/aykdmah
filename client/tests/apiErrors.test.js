import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { translate } = require('../../server/utils/i18n.js');
const languages = ['ar', 'en', 'ur', 'hi', 'bn'];
const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
globalThis.window = new EventTarget();
window.location = { pathname: '/', href: '' };

const output = await build({
  stdin: {
    resolveDir: new URL('../src/', import.meta.url).pathname,
    contents: `export { default as api, apiError } from './services/api.js';
      export { default as i18n } from './i18n/index.js';`,
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'shared-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react-i18next|axios)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const { api, apiError, i18n } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('API requests follow all five current UI languages and preserve explicit overrides', async () => {
  let captured;
  api.defaults.adapter = async config => {
    captured = config;
    return { config, data: {}, status: 200, statusText: 'OK', headers: {} };
  };
  for (const language of languages) {
    await i18n.changeLanguage(language);
    await api.get('/categories');
    assert.equal(captured.headers.get('Accept-Language'), language);
  }
  await i18n.changeLanguage('hi-IN');
  await api.get('/services');
  assert.equal(captured.headers.get('Accept-Language'), 'hi');
  await api.get('/services', { headers: { 'accept-language': 'en' } });
  assert.equal(captured.headers.get('Accept-Language'), 'en');
});

test('known account and provider failures translate from any backend language into the selected UI language', async () => {
  const failures = [
    ['invalid_credentials', 'auth.invalid_credentials', 401],
    ['account_blocked', 'auth.account_blocked', 403],
    ['account_inactive', 'errors.account_inactive', 403],
    ['current_password_wrong', 'errors.current_password_wrong', 401],
    ['phone_taken', 'auth.identity_in_use_hint', 409],
    ['email_taken', 'auth.identity_in_use_hint', 409],
    ['username_taken', 'auth.identity_in_use_hint', 409],
    ['facebook_taken', 'auth.identity_in_use_hint', 409],
    ['provider_phone_required', 'auth.provider_phone_required', 400],
    ['provider_area_required', 'auth.provider_area_required', 400],
    ['provider_services_required', 'provider.services_required', 400],
    ['verification_required', 'errors.verification_required', 403],
    ['too_many_attempts', 'errors.too_many_requests', 429],
    ['invalid_data', 'errors.invalid_data', 400],
    ['request_not_open', 'request.no_longer_open', 409],
  ];
  for (const language of languages) {
    await i18n.changeLanguage(language);
    for (const [code, key, status] of failures) {
      assert.ok(i18n.exists(key), `Missing ${language} ${key}`);
      assert.match(i18n.t(key), scripts[language], `Missing native ${language} ${key}`);
      assert.equal(apiError({ response: { status, data: { code } } }), i18n.t(key));
      for (const serverLanguage of languages) {
        assert.equal(apiError({ response: { status, data: { message: translate(serverLanguage, code) } } }), i18n.t(key), `${language} UI / ${serverLanguage} ${code}`);
      }
    }
  }
});

test('unknown or malformed server errors never expose diagnostics and use the active language', async () => {
  const privateMessage = 'SQL failed at /private/server.js: password=private-secret';
  for (const language of languages) {
    await i18n.changeLanguage(language);
    for (const message of [privateMessage, { unsafe: true }, ['raw'], 17, null]) {
      assert.equal(apiError({ response: { status: 500, data: { message, code: 'invalid_credentials' } } }), i18n.t('errors.generic'));
      assert.equal(apiError({ response: { data: { message } } }), i18n.t('errors.generic'));
    }
    assert.equal(apiError(new Error(privateMessage)), i18n.t('errors.generic'));
    assert.equal(apiError({ response: { data: { code: 'constructor' } } }), i18n.t('errors.generic'));
    assert.equal(apiError(null), i18n.t('errors.generic'));
    assert.equal(apiError({ isAxiosError: true, code: 'ERR_NETWORK', message: privateMessage }), i18n.t('errors.network'));
    assert.equal(apiError({ code: 'ECONNABORTED' }), i18n.t('errors.network'));
  }
});

test('legacy status-only failures retain useful localized account guidance', async () => {
  for (const language of languages) {
    await i18n.changeLanguage(language);
    assert.equal(apiError({ config: { url: '/auth/login' }, response: { status: 401 } }), i18n.t('auth.invalid_credentials'));
    assert.equal(apiError({ config: { url: '/auth/password' }, response: { status: 401 } }), i18n.t('errors.current_password_wrong'));
    assert.equal(apiError({ config: { url: '/auth/register' }, response: { status: 409 } }), i18n.t('auth.identity_in_use_hint'));
    assert.equal(apiError({ response: { status: 422, data: { errors: [{ field: 'password', message: 'Invalid value' }] } } }), i18n.t('errors.invalid_data'));
    assert.equal(apiError({ response: { status: 403 } }), i18n.t('errors.forbidden'));
    assert.equal(apiError({ response: { status: 429 } }), i18n.t('errors.too_many_requests'));
  }
});
