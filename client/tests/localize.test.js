import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, SERVICES } from '../src/data/servicesCatalog.js';
import { localizedName, localizedPlatformText, tx } from '../src/utils/localize.js';
import { filterCatalogServices } from '../src/utils/catalogFilters.js';

const locales = ['ar', 'en', 'ur', 'hi', 'bn'];
const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };

test('every launch catalog label is translated in all five supported languages', () => {
  const values = [
    ...CATEGORIES.flatMap(category => [category.name, category.desc]),
    ...SERVICES.flatMap(service => [
      service.title, service.desc, service.longDesc, service.duration, service.city,
      service.coverage, service.provider.name, ...service.includes, ...service.excludes,
    ]),
  ];
  for (const value of values) {
    for (const locale of locales) {
      assert.equal(typeof value[locale], 'string', `Missing ${locale} translation for ${value.en}`);
      assert.match(tx(value, locale), scripts[locale]);
      assert.equal(tx(value, `${locale}-XX`), value[locale]);
    }
  }
  for (const locale of ['en', 'ur', 'hi', 'bn']) {
    for (const category of CATEGORIES) assert.notEqual(tx(category.name, locale), category.name.ar);
  }
});

test('service search finds native catalog names regardless of active UI language', () => {
  for (const category of CATEGORIES) {
    for (const locale of locales) {
      const rows = filterCatalogServices(SERVICES, CATEGORIES, { q: category.name[locale], sort: 'default' }, 'en');
      assert.deepEqual(rows.map(row => row.categorySlug), [category.slug]);
    }
  }
});

test('requested DB name takes precedence over another-language JSON fallback', () => {
  const row = { name_translations: { ar: 'سباكة', en: 'Plumbing' }, name_hi: 'प्लंबिंग', name_ar: 'الاسم القديم' };
  assert.equal(localizedName(row, 'hi-IN'), row.name_hi);
  assert.equal(localizedName(row, 'EN_us'), 'Plumbing');
  assert.equal(localizedName(row, 'ar-SA'), 'سباكة');
  assert.equal(localizedName({ ...row, name_translations: { ...row.name_translations, hi: 'خدمة مخصصة' } }, 'hi'), 'خدمة مخصصة');
  assert.equal(localizedName({ name_translations: { en: 'English' }, name_ar: 'العربية' }), 'العربية');
});

test('serialized translations and malformed records fall back safely without replacing custom names', () => {
  assert.equal(localizedName({ name_translations: '{"bn":"নিজস্ব সেবা","en":"Custom service"}' }, 'bn-BD'), 'নিজস্ব সেবা');
  assert.equal(localizedName({ name_translations: '{invalid', name: 'خدمة كتبها صاحبها' }, 'hi'), 'خدمة كتبها صاحبها');
  assert.equal(localizedName({ name_translations: ['incorrect array'], name_hi: 'मेरा नाम' }, 'hi'), 'मेरा नाम');
  assert.equal(localizedName({ name_translations: { hi: '  ', en: 'Fallback' }, name_hi: 'सेवा' }, 'hi'), 'सेवा');
  assert.equal(localizedName({ name_translations: { en: 8, ar: false }, name: 'Custom' }, 'en'), 'Custom');
  assert.equal(localizedName({ name_translations: { ur: 'حسبِ ضرورت' } }, 'fr'), 'حسبِ ضرورت');
  for (const value of [null, undefined, 4, 'plain']) assert.equal(localizedName(value, 'hi'), '');
});

test('catalog resolver normalizes locale tags and retains unknown-language and plain-text fallbacks', () => {
  const labels = { ar: 'اسم', en: 'Name', hi: 'नाम', bn: 'নাম', ur: 'نام' };
  assert.equal(tx(labels, ' HI_in '), labels.hi);
  assert.equal(tx(labels, 'BN-BD'), labels.bn);
  assert.equal(tx(labels, null), labels.ar);
  assert.equal(tx(labels, 'fr'), labels.ar);
  assert.equal(tx({ ar: '   ', en: 'Name' }, 'bn'), 'Name');
  assert.equal(tx('Provider supplied text', 'hi'), 'Provider supplied text');
  for (const value of [null, undefined, 4, ['invalid'], {}]) assert.equal(tx(value, 'ar'), '');
});

test('reference names fill native languages only when the original bilingual label still matches', () => {
  const plumbing = { slug: 'plumbing', name_ar: 'سباكة', name_en: 'Plumbing' };
  assert.equal(localizedName(plumbing, 'hi-IN'), 'प्लंबिंग');
  assert.equal(localizedName(plumbing, 'bn'), 'প্লাম্বিং');
  assert.equal(localizedName({ ...plumbing, name_translations: { ar: plumbing.name_ar, en: plumbing.name_en } }, 'ur'), 'پلمبنگ');
  assert.equal(localizedName({ ...plumbing, name_hi: 'اسم عدله المسؤول' }, 'hi'), 'اسم عدله المسؤول');
  assert.equal(localizedName({ ...plumbing, name_translations: { hi: 'اسم مخصص' } }, 'hi'), 'اسم مخصص');
  assert.equal(localizedName({ ...plumbing, name_translations: { ar: 'سباكة متخصصة', en: 'Plumbing' } }, 'hi'), 'Plumbing');
  assert.equal(localizedName({ ...plumbing, name_translations: { ar: 'سباكة', en: 'Custom plumbing' } }, 'hi'), 'Custom plumbing');
  assert.equal(localizedName({ ...plumbing, name_translations: { ar: 'سباكة متخصصة' } }, 'hi'), 'سباكة متخصصة');
  assert.equal(localizedName({ ...plumbing, name_ar: 'سباكة متخصصة' }, 'hi'), 'سباكة متخصصة');
  assert.equal(localizedName({ ...plumbing, name_en: 'Specialist plumbing' }, 'hi'), 'سباكة');
  assert.equal(localizedName({ ...plumbing, slug: 'custom-plumbing' }, 'hi'), 'سباكة');
  assert.equal(localizedName({ name_ar: 'سباكة' }, 'hi'), 'سباكة');
});

test('seeded geography reference names render in native scripts without changing custom locations', () => {
  const region = { name_ar: 'القصيم', name_en: 'Al Qassim' };
  const district = { name_ar: 'الملك فهد', name_en: 'King Fahd Dist.' };
  assert.equal(localizedName(region, 'hi'), 'अल-क़सीम');
  assert.equal(localizedName(region, 'bn'), 'আল-কাসিম');
  assert.equal(localizedName(region, 'ur'), 'القصیم');
  for (const locale of ['ur', 'hi', 'bn']) assert.match(localizedName(district, locale), scripts[locale]);
  assert.equal(localizedName({ ...region, name_translations: { ar: 'منطقة خاصة', en: 'Custom region' } }, 'hi'), 'Custom region');
  assert.equal(localizedName({ name_ar: 'حي جديد', name_en: 'New district' }, 'hi'), 'حي جديد');
});

test('known subscription features use all five languages and custom text stays unchanged', () => {
  const feature = 'استقبال الطلبات في منطقتك';
  const expected = {
    ar: feature, en: 'Receive requests in your area', ur: 'اپنے علاقے میں درخواستیں وصول کریں',
    hi: 'अपने क्षेत्र में अनुरोध पाएँ', bn: 'আপনার এলাকায় অনুরোধ গ্রহণ করুন',
  };
  for (const locale of locales) {
    assert.equal(localizedPlatformText(feature, locale), expected[locale]);
    assert.equal(localizedPlatformText(expected.en, `${locale}-XX`), expected[locale]);
    assert.equal(localizedPlatformText('ميزة كتبها مقدم الخدمة بنفسه', locale), 'ميزة كتبها مقدم الخدمة بنفسه');
  }
  assert.equal(localizedPlatformText({ hi: 'ميزة مترجمة صراحةً', ar: 'ميزة' }, 'hi'), 'ميزة مترجمة صراحةً');
  assert.equal(localizedPlatformText(feature, 'fr'), feature);
  assert.equal(localizedPlatformText(null, 'en'), '');
});

test('all original subscription feature labels have native translations, including the free trial', () => {
  const seed = readFileSync(new URL('../../database/seed.sql', import.meta.url), 'utf8');
  const plans = seed.split('-- Subscription plans')[1].split('-- Default site settings')[0];
  const features = [...plans.matchAll(/JSON_ARRAY\(([^)]*)\)/g)]
    .flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]));
  assert.equal(features.length, 12);
  for (const feature of features) {
    for (const locale of locales) assert.match(localizedPlatformText(feature, locale), scripts[locale]);
    for (const locale of ['en', 'hi', 'bn', 'ur']) assert.notEqual(localizedPlatformText(feature, locale), feature);
  }
});
