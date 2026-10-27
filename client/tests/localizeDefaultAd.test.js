import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizedDefaultAdCopy } from '../src/utils/localizeDefaultAd.js';

const banner = Object.freeze({
  id: 1,
  title: 'مرحباً بك في منصة الخدمات',
  description: 'اطلب أي خدمة محلية بسهولة وسرعة',
  placement: 'home_top', image: null, link: null,
});

test('the exact platform welcome banner follows all five languages without changing the original advertisement', () => {
  const seed = readFileSync(new URL('../../database/seed.sql', import.meta.url), 'utf8');
  assert.ok(seed.includes(`(1, '${banner.title}', '${banner.description}', 'home_top', 1)`));
  const scripts = { ar: /[\u0600-\u06ff]/, en: /[A-Za-z]/, ur: /[\u0600-\u06ff]/, hi: /[\u0900-\u097f]/, bn: /[\u0980-\u09ff]/ };
  for (const [lang, script] of Object.entries(scripts)) {
    const copy = localizedDefaultAdCopy(banner, lang);
    assert.match(copy.title, script);
    assert.match(copy.description, script);
    if (!['ar', 'ur'].includes(lang)) {
      assert.doesNotMatch(copy.title, scripts.ar);
      assert.doesNotMatch(copy.description, scripts.ar);
    }
    if (lang !== 'ar') assert.notEqual(copy.title, banner.title);
  }
  assert.deepEqual(localizedDefaultAdCopy(banner, 'hi-IN'), localizedDefaultAdCopy(banner, 'hi'));
  assert.deepEqual(localizedDefaultAdCopy(banner, 'unsupported'), { title: banner.title, description: banner.description });
  assert.equal(banner.title, 'مرحباً بك في منصة الخدمات');
  assert.equal(banner.description, 'اطلب أي خدمة محلية بسهولة وسرعة');
});

test('custom title, description, placement, media, links and other advertiser records retain their original copy', () => {
  const changes = [
    { id: 2 },
    { title: 'نص إعلان كتبه المستخدم' },
    { description: 'Custom advertiser description' },
    { placement: 'home_middle' },
    { placement: undefined },
    { image: '/uploads/custom-banner.png' },
    { link: 'https://example.com/offer' },
  ];
  for (const change of changes) {
    const ad = { ...banner, ...change };
    assert.deepEqual(localizedDefaultAdCopy(ad, 'hi'), { title: ad.title, description: ad.description });
    assert.deepEqual(ad, { ...banner, ...change });
  }
});
