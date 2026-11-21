// AYK-396: a new account without an area gets its region and city from its connection, without a
// prompt; an account that already has a city is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

function load({ user, geo, cities }) {
  const updates = [];
  const original = Module._load;
  Module._load = function (request) {
    if (/config\/database$/.test(request)) return {
      queryOne: async (sql) => (/FROM users/.test(sql) ? user : /FROM regions/.test(sql) ? { id: geo?.region_id, country_id: 1 } : null),
      query: async (sql, params) => {
        if (/FROM cities/.test(sql)) return cities;
        if (/information_schema/.test(sql)) return [{ column_name: 'region_id' }, { column_name: 'country_id' }, { column_name: 'governorate_id' }];
        if (/^UPDATE users/.test(sql)) { updates.push({ sql, params }); return []; }
        return [];
      },
    };
    if (/ipGeoService$/.test(request)) return { lookup: async () => geo, ipFromRequest: () => '203.0.113.9' };
    if (/utils\/logger$/.test(request)) return { warn() {} };
    return original.apply(this, arguments);
  };
  const file = path.join(__dirname, '..', 'services', 'accountAreaFromIp.js');
  delete require.cache[file];
  const mod = require(file);
  Module._load = original;
  return { mod, updates };
}

test('no area yet: region and city from the connection, only while still empty', async () => {
  const { mod, updates } = load({ user: { id: 7, city_id: null }, geo: { region_id: 5, city: 'Buraydah' },
    cities: [{ id: 40, name_ar: 'بريدة', name_en: 'Buraydah', region_id: 5, governorate_id: 9 }] });
  assert.deepEqual(await mod.fillAccountAreaFromIp({}, 7), { region_id: 5, city_id: 40 });
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /city_id IS NULL/);
  assert.deepEqual(updates[0].params, [5, 1, 40, 9, 7]);
});

test('a city in the region not found: the region alone', async () => {
  const { mod, updates } = load({ user: { id: 7, city_id: null }, geo: { region_id: 5, city: 'Somewhere' }, cities: [] });
  assert.deepEqual(await mod.fillAccountAreaFromIp({}, 7), { region_id: 5, city_id: null });
  assert.deepEqual(updates[0].params, [5, 1, 7]);
});

test('an account that has a city, or no location from the connection: nothing changes', async () => {
  let loaded = load({ user: { id: 7, city_id: 3 }, geo: { region_id: 5, city: 'Buraydah' }, cities: [] });
  assert.equal(await loaded.mod.fillAccountAreaFromIp({}, 7), null);
  assert.equal(loaded.updates.length, 0);
  loaded = load({ user: { id: 7, city_id: null }, geo: null, cities: [] });
  assert.equal(await loaded.mod.fillAccountAreaFromIp({}, 7), null);
  assert.equal(loaded.updates.length, 0);
});
