import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, SERVICES } from '../src/data/servicesCatalog.js';
import {
  readCatalogFilters, filterCatalogServices, changeCatalogParams, catalogQuery,
  validateCatalogLocation, rememberCatalogSearch, readRememberedCatalogSearch,
} from '../src/utils/catalogFilters.js';

const filters = patch => ({ q: '', region: '', governorate: '', city: '', district: '', sort: 'default', ...patch });
const hierarchy = {
  regions: [{ id: 1 }, { id: 4 }],
  governorates: [{ id: 5, region_id: 1 }, { id: 46, region_id: 4 }, { id: 47, region_id: 4 }],
  cities: [
    { id: 9, region_id: 4, governorate_id: 46, name_ar: 'بريدة' },
    { id: 16, region_id: 4, governorate_id: 47, name_ar: 'عنيزة' },
    { id: 88, region_id: 1, governorate_id: 5, name_ar: 'المجمعة' },
    { id: 89, region_id: 4, governorate_id: null, name_ar: 'قبة' },
    { id: 1, region_id: 1, governorate_id: 1, name_ar: 'الرياض' },
  ],
  districts: [{ id: 101, city_id: 9 }, { id: 102, city_id: 16 }],
};

test('service search checks Arabic/English and translated aliases independently of UI language', () => {
  for (const query of ['Plumbing', 'pLuMbInG', ' سباكة ', 'سَبَاكَة', 'plumber']) {
    assert.deepEqual(filterCatalogServices(SERVICES, CATEGORIES, filters({ q: query }), 'en').map(row => row.id), [13]);
  }
  assert.deepEqual(filterCatalogServices(SERVICES, CATEGORIES, filters({ q: 'غسيل الحوش' }), 'en').map(row => row.id), [3001]);
  assert.equal(filterCatalogServices(SERVICES, CATEGORIES, filters({ q: 'nothing matching here' })).length, 0);
  assert.equal(filterCatalogServices(SERVICES, CATEGORIES, filters({ q: '' })).length, 3);
});

test('name sorting changes rendered order honestly and does not mutate catalog', () => {
  const original = SERVICES.map(row => row.id);
  assert.deepEqual(filterCatalogServices(SERVICES, CATEGORIES, filters({ sort: 'name_asc' }), 'en').map(row => row.id), [11, 13, 3001]);
  assert.deepEqual(filterCatalogServices(SERVICES, CATEGORIES, filters({ sort: 'name_desc' }), 'en').map(row => row.id), [3001, 13, 11]);
  assert.deepEqual(SERVICES.map(row => row.id), original);
  assert.ok(SERVICES.every(row => row.priceFrom === null));
});

test('hierarchy rejects unsupported cities and mismatched location combinations', () => {
  assert.equal(validateCatalogLocation(filters({ region: '4', governorate: '46', city: '9', district: '101' }), hierarchy), true);
  assert.equal(validateCatalogLocation(filters({ region: '1', governorate: '5', city: '88' }), hierarchy), true);
  assert.equal(validateCatalogLocation(filters({ region: '4', city: '89' }), hierarchy), true);
  assert.equal(validateCatalogLocation(filters({ city: '9' }), hierarchy), true);
  for (const patch of [
    { city: '1' }, { city: '999' }, { region: '1', city: '9' },
    { governorate: '47', city: '9' }, { city: '9', district: '102' },
    { district: '101' }, { region: '4x' }, { city: '-9' },
  ]) assert.equal(validateCatalogLocation(filters(patch), hierarchy), false, JSON.stringify(patch));
  assert.deepEqual(filterCatalogServices(SERVICES, CATEGORIES, filters(), 'ar', false), []);
});

test('URL edits clear dependent locations while retaining search, sort and navigation context', () => {
  const initial = new URLSearchParams('q=Plumbing&region=4&governorate=46&city=9&district=101&sort=name_desc&token=secret');
  const next = changeCatalogParams(initial, { region: '1' });
  assert.equal(next.get('q'), 'Plumbing');
  assert.equal(next.get('sort'), 'name_desc');
  assert.equal(next.get('region'), '1');
  for (const key of ['governorate', 'city', 'district', 'token']) assert.equal(next.has(key), false);
  const cityChange = changeCatalogParams(initial, { city: '16' });
  assert.equal(cityChange.has('district'), false);
  assert.equal(cityChange.get('region'), '4');
  assert.equal(changeCatalogParams(initial, { q: '' }).has('q'), false);
  assert.equal(readCatalogFilters(new URLSearchParams('sort=nearest')).sort, 'default');
  assert.equal(catalogQuery(initial).includes('token'), false);
});

test('last search stores only whitelisted public fields and round-trips IDs and Arabic text', () => {
  const rows = new Map();
  const storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value) };
  rememberCatalogSearch(new URLSearchParams('q=سباكة&region=4&city=9&district=101&token=secret'), storage);
  const restored = readRememberedCatalogSearch(storage);
  assert.equal(restored.get('q'), 'سباكة');
  assert.equal(restored.get('city'), '9');
  assert.equal(restored.get('district'), '101');
  assert.equal(restored.has('token'), false);
});
