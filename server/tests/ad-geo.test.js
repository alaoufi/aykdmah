// AYK-394: where an ad shows, the narrowest choice winning.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Load the controller without a database: only matchesGeo is used here.
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (/config\/database$/.test(request)) return { query: async () => [], queryOne: async () => null };
  return original.apply(this, arguments);
};
const { matchesGeo } = require(path.join(__dirname, '..', 'controllers', 'adController'));
Module._load = original;

const RIYADH = 1, QASSIM = 5;
const cityRegion = new Map([['الرياض', RIYADH], ['الدرعية', RIYADH], ['بريدة', QASSIM], ['عنيزة', QASSIM]]);
const at = (city, region_id) => ({ country: 'SA', region_id, city, city_names: [city] });

test('a country alone: the whole country', () => {
  assert.equal(matchesGeo({ target_countries: ['SA'] }, at('بريدة', QASSIM), cityRegion), true);
});

test('country and a region: only the region (it was the whole kingdom)', () => {
  const ad = { target_countries: ['SA'], target_regions: [RIYADH] };
  assert.equal(matchesGeo(ad, at('الدرعية', RIYADH), cityRegion), true);
  assert.equal(matchesGeo(ad, at('بريدة', QASSIM), cityRegion), false);
});

test('a region with some of its cities: only those cities', () => {
  const ad = { target_regions: [QASSIM], target_cities: ['بريدة'] };
  assert.equal(matchesGeo(ad, at('بريدة', QASSIM), cityRegion), true);
  assert.equal(matchesGeo(ad, at('عنيزة', QASSIM), cityRegion), false);
});

test('two regions, cities chosen in one only: that one narrowed, the other whole', () => {
  const ad = { target_regions: [QASSIM, RIYADH], target_cities: ['بريدة'] };
  assert.equal(matchesGeo(ad, at('عنيزة', QASSIM), cityRegion), false);
  assert.equal(matchesGeo(ad, at('الدرعية', RIYADH), cityRegion), true);
});

test('no targeting shows everywhere; targeting with an unknown visitor shows nowhere', () => {
  assert.equal(matchesGeo({}, null, cityRegion), true);
  assert.equal(matchesGeo({ target_regions: [RIYADH] }, null, cityRegion), false);
});
