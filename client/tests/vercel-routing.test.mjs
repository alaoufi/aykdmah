import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const matches = (source, path) => new RegExp(`^${source}$`).test(path);
const spa = config.rewrites.find(route => route.destination === '/index.html');
const headerValue = (path, key) => config.headers.reduce((value, route) => {
  if (!matches(route.source, path)) return value;
  return route.headers.find(header => header.key.toLowerCase() === key.toLowerCase())?.value || value;
}, '');

test('missing script and static-resource URLs cannot become the SPA HTML shell', () => {
  for (const path of [
    '/assets/missing.js', '/assets/HomePage-DEADbeef.js', '/unknown-script.js',
    '/unknown-runtime.mjs', '/unknown-runtime.wasm', '/assets/missing.wasm',
    '/brand/missing.svg', '/icons/missing.png', '/meta/og-image.png',
    '/sw.js', '/registerSW.js', '/workbox-12345678.js', '/offline.js',
    '/theme-init.js', '/offline.html', '/manifest.webmanifest', '/site.webmanifest',
  ]) assert.equal(matches(spa.source, path), false, path);
  for (const path of ['/', '/services', '/services/12', '/register', '/profile', '/admin/settings']) {
    assert.equal(matches(spa.source, path), true, path);
  }
});

test('server-owned API, installer, upload, and socket routes remain outside the SPA fallback', () => {
  for (const path of ['/api', '/api/health', '/install', '/install/status', '/uploads/a.mp3', '/socket.io/']) {
    assert.equal(matches(spa.source, path), false, path);
  }
  assert.equal(config.rewrites[0].destination, '/api/index');
  assert.equal(matches(config.rewrites[0].source, '/api/health'), true);
});

test('HTML and bootstrap files revalidate while fingerprinted build assets retain immutable caching', () => {
  for (const path of ['/', '/register', '/services/12', '/index.html', '/offline.html', '/sw.js', '/theme-init.js', '/registerSW.js', '/manifest.webmanifest', '/assets/missing.js', '/assets/awtad-missing-asset-check.js', '/app-recovery.js', '/refresh-site.js', '/install/refresh.html']) {
    assert.match(headerValue(path, 'Cache-Control'), /no-store/, path);
  }
  assert.equal(headerValue('/assets/HomePage-Ab12Cd34.js', 'Cache-Control'), 'public, max-age=31536000, immutable');
  for (const extension of ['mjs', 'wasm']) {
    assert.equal(headerValue(`/assets/ort-wasm-simd-threaded-Ab12Cd34.${extension}`, 'Cache-Control'), 'public, max-age=31536000, immutable');
  }
  assert.match(headerValue('/brand/awtad-logo.svg', 'Cache-Control'), /no-store/);
});
