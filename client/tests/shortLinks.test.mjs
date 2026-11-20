import test from 'node:test';
import assert from 'node:assert/strict';
import { shortLinkTarget } from '../src/utils/shortLinks.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
const settings = { google_play_url: 'https://play.google.com/store/apps/details?id=sa.aykdmh.app', app_store_url: 'https://apps.apple.com/app/id6829494773' };

test('short app addresses lead to the right store (AYK-351)', () => {
  assert.equal(shortLinkTarget('/app', IPHONE, settings), settings.app_store_url);
  assert.equal(shortLinkTarget('/app', ANDROID, settings), '', 'Android: our page, whose button opens the Play Store app');
  assert.equal(shortLinkTarget('/gl', ANDROID, settings), '');
  assert.equal(shortLinkTarget('/app', PC, settings), '', 'a computer gets the page with both');
  assert.equal(shortLinkTarget('/gl', PC, settings), settings.google_play_url);
  assert.equal(shortLinkTarget('/GL/', IPHONE, settings), settings.google_play_url);
  assert.equal(shortLinkTarget('/ios', ANDROID, settings), settings.app_store_url);
  assert.equal(shortLinkTarget('/services', IPHONE, settings), '');
  // A setting pointing elsewhere is not followed; the known store is used instead.
  assert.equal(shortLinkTarget('/ios', IPHONE, { app_store_url: 'https://evil.example/app' }), settings.app_store_url);
});
