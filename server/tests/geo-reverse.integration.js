// This suite creates and deletes only a unique, disposable localhost database.
// No inherited application database URL is allowed to select its test database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.RYZA_GEO_TEST_DB;

if (!databasePrefix) {
  test('reverse geocoding integration (set RYZA_GEO_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ryza_test_geo[a-z0-9_]{0,20}$/.test(databasePrefix)) {
    throw new Error('Use a disposable ryza_test_geo* database prefix.');
  }
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.RYZA_TEST_PORT || '5432');
  Object.assign(process.env, {
    NODE_ENV: 'test', VERCEL: '', AUTO_MIGRATE: 'false',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const install = require('../services/installService');
  const ipGeo = require('../services/ipGeoService');
  const originalReverse = ipGeo.reverseGeocode;
  const originalVisitorGeo = ipGeo.resolveVisitorGeo;
  let server, base, createdDatabase = false, reverseResult = null;
  let reverseCalls = [], visitorCalls = 0;
  let buraidah, majmaah, qibah;

  const maintenanceClient = () => new Client({
    host: '127.0.0.1', port, user: 'postgres', password: '',
    database: 'postgres', ssl: false, connectionTimeoutMillis: 15000,
  });
  async function reverse(query, expected = 200) {
    const response = await fetch(`${base}/geo/reverse?${query}`, {
      headers: { 'X-Real-IP': '8.8.8.8' },
    });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  }
  function address(values = {}) {
    return { country: 'SA', city: 'بريدة', provider: 'test-address', ...values };
  }
  function assertCityParents(result, source) {
    assert.equal(Number(result.city?.id), Number(source.id));
    assert.equal(Number(result.region?.id), Number(source.region_id));
    assert.equal(result.city.region_id, source.region_id);
    if (source.governorate_id == null) {
      assert.equal(result.governorate, null);
      assert.equal(result.city.governorate_id, null);
    } else {
      assert.equal(Number(result.governorate?.id), Number(source.governorate_id));
      assert.equal(Number(result.governorate.region_id), Number(result.region.id));
    }
  }

  test.before(async () => {
    const admin = maintenanceClient();
    await admin.connect();
    try {
      // databaseName contains validated ASCII plus a generated hexadecimal suffix.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      createdDatabase = true;
    } finally { await admin.end(); }
    const setup = await install.setupFromEnv();
    assert.equal(setup.migrations.flatMap(migration => migration.errors).length, 0);
    buraidah = await db.queryOne('SELECT * FROM cities WHERE id = 9');
    majmaah = await db.queryOne('SELECT * FROM cities WHERE governorate_id = 5 AND is_active = 1');
    qibah = await db.queryOne('SELECT * FROM cities WHERE name_ar = ? AND region_id = 4', ['قبة']);
    assert.ok(buraidah && majmaah && qibah);
    ipGeo.reverseGeocode = async coordinates => {
      reverseCalls.push(coordinates);
      return reverseResult;
    };
    ipGeo.resolveVisitorGeo = async () => {
      visitorCalls++;
      throw new Error('A map pin must never be resolved from the visitor IP.');
    };
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  test.after(async () => {
    ipGeo.reverseGeocode = originalReverse;
    ipGeo.resolveVisitorGeo = originalVisitorGeo;
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const admin = maintenanceClient();
      await admin.connect();
      try { await admin.query(`DROP DATABASE "${databaseName}"`); }
      finally { await admin.end(); }
    }
  });

  test('missing, nonfinite and out-of-range pin coordinates are rejected before lookup', async () => {
    const previous = reverseCalls.length;
    for (const query of [
      '', 'lat=28', 'lon=45', 'lat=&lon=45', 'lat=%20&lon=45',
      'lat=NaN&lon=45', 'lat=Infinity&lon=45', 'lat=28&lon=-Infinity',
      'lat=90.1&lon=45', 'lat=-90.1&lon=45', 'lat=28&lon=180.1', 'lat=28&lon=-180.1',
    ]) await reverse(query, 400);
    assert.equal(reverseCalls.length, previous);
    assert.equal(visitorCalls, 0);
  });

  test('provider failure at distant coordinates leaves the pin unmatched and unchanged', async () => {
    reverseResult = null;
    const result = await reverse('lat=-40.125&lon=120.375');
    assert.equal(result.matched, false);
    assert.equal(result.best_effort, false);
    assert.equal(result.latitude, -40.125);
    assert.equal(result.longitude, 120.375);
    for (const field of ['country', 'region', 'governorate', 'city', 'district', 'provider', 'raw']) {
      assert.equal(result[field], null);
    }
    assert.deepEqual(reverseCalls.at(-1), { lat: -40.125, lon: 120.375 });
    assert.equal(visitorCalls, 0);
  });

  test('nearby launch-city fallback gives coherent Buraidah and Majmaah parents without guessing a district', async () => {
    reverseResult = null;
    const district = await db.queryOne('SELECT id FROM districts WHERE city_id = 9 AND is_active = 1 LIMIT 1');
    await db.query('UPDATE districts SET latitude = ?, longitude = ? WHERE id = ?',
      [buraidah.latitude, buraidah.longitude, district.id]);
    try {
      for (const source of [buraidah, majmaah]) {
        const latitude = Number(source.latitude), longitude = Number(source.longitude);
        const result = await reverse(`lat=${latitude}&lon=${longitude}`);
        assert.equal(result.matched, true);
        assert.equal(result.country.code, 'SA');
        assert.equal(result.best_effort, true);
        assert.equal(result.provider, 'local-city-center');
        assertCityParents(result, source);
        assert.equal(result.district, null, 'Even nearby district coordinates cannot justify a fallback district');
        assert.equal(result.latitude, latitude);
        assert.equal(result.longitude, longitude);
      }
    } finally {
      await db.query('UPDATE districts SET latitude = NULL, longitude = NULL WHERE id = ?', [district.id]);
    }
    assert.equal(visitorCalls, 0);
  });

  test('normalized address names select only the matching region and derive city parents', async () => {
    reverseResult = address({ region: 'منطقة القصيم', city: 'مدينة بُرَيْدَة' });
    const result = await reverse('lat=0&lon=0');
    assert.equal(result.best_effort, false);
    assertCityParents(result, buraidah);

    reverseResult = address({ region: 'منطقة الرياض', governorate: 'محافظة بريدة' });
    const conflicting = await reverse('lat=0&lon=0');
    assert.equal(Number(conflicting.region.id), 1);
    assert.equal(conflicting.governorate, null);
    assert.equal(conflicting.city, null, 'A Qassim city must not match a Riyadh-scoped address');

    reverseResult = address({ region: 'القصيم', governorate: 'عنيزة' });
    const mismatchedGovernorate = await reverse('lat=0&lon=0');
    assert.equal(Number(mismatchedGovernorate.governorate.id), 47);
    assert.equal(mismatchedGovernorate.city, null);
  });

  test('identical district names stay inside their selected city, and inactive districts are rejected', async () => {
    const duplicateName = 'اليرموك';
    const buraidahDistrict = await db.queryOne('SELECT * FROM districts WHERE city_id = 9 AND name_ar = ?', [duplicateName]);
    const unaizahDistrict = await db.queryOne('SELECT * FROM districts WHERE city_id = 16 AND name_ar = ?', [duplicateName]);
    assert.ok(buraidahDistrict && unaizahDistrict, 'Fixture coverage includes the repeated Arabic neighborhood name');
    assert.notEqual(Number(buraidahDistrict.id), Number(unaizahDistrict.id));
    for (const [city, expected] of [['بريدة', buraidahDistrict], ['عنيزة', unaizahDistrict]]) {
      reverseResult = address({ city, district: `حي ${duplicateName}` });
      const result = await reverse('lat=0&lon=0');
      assert.equal(Number(result.district?.id), Number(expected.id));
      assert.equal(Number(result.district.city_id), Number(result.city.id));
    }
    await db.query('UPDATE districts SET is_active = 0 WHERE id = ?', [buraidahDistrict.id]);
    try {
      reverseResult = address({ district: duplicateName });
      const result = await reverse('lat=0&lon=0');
      assertCityParents(result, buraidah);
      assert.equal(result.district, null, 'Do not borrow the still-active name from Unaizah');
    } finally {
      await db.query('UPDATE districts SET is_active = 1 WHERE id = ?', [buraidahDistrict.id]);
    }
  });

  test('inactive countries, regions and cities cannot supply selected location IDs', async () => {
    await db.query('UPDATE cities SET is_active = 0 WHERE id = 9');
    try {
      reverseResult = address();
      const result = await reverse('lat=0&lon=0');
      assert.equal(result.city, null);
      assert.equal(result.district, null);
    } finally { await db.query('UPDATE cities SET is_active = 1 WHERE id = 9'); }

    await db.query('UPDATE regions SET is_active = 0 WHERE id = 4');
    try {
      reverseResult = address({ region: 'القصيم', governorate: 'بريدة' });
      const result = await reverse('lat=0&lon=0');
      assert.equal(result.region, null);
      assert.equal(result.governorate, null);
      assert.equal(result.city, null);
    } finally { await db.query('UPDATE regions SET is_active = 1 WHERE id = 4'); }

    await db.query("UPDATE countries SET is_active = 0 WHERE code = 'SA'");
    try {
      reverseResult = address();
      const result = await reverse(`lat=${buraidah.latitude}&lon=${buraidah.longitude}`);
      assert.equal(result.matched, false);
      assert.equal(result.country, null);
      assert.equal(result.city, null);
      assert.equal(result.best_effort, false);
    } finally { await db.query("UPDATE countries SET is_active = 1 WHERE code = 'SA'"); }
  });

  test('address country scope cannot borrow a Saudi city and a foreign address never triggers local fallback', async () => {
    const country = await db.queryOne("SELECT * FROM countries WHERE code = 'EG'");
    assert.ok(country);
    await db.query("UPDATE countries SET is_active = 1 WHERE code = 'EG'");
    try {
      reverseResult = address({ country: 'EG', region: 'القصيم' });
      const result = await reverse(`lat=${buraidah.latitude}&lon=${buraidah.longitude}`);
      assert.equal(result.country.code, 'EG');
      assert.equal(result.best_effort, false);
      assert.equal(result.region, null);
      assert.equal(result.governorate, null);
      assert.equal(result.city, null);
      assert.equal(result.district, null);
    } finally { await db.query("UPDATE countries SET is_active = ? WHERE code = 'EG'", [country.is_active]); }
  });

  test('a city linked directly to Qassim supports name matching without inventing a governorate', async () => {
    reverseResult = address({ city: 'مدينة قبة' });
    const result = await reverse(`lat=${qibah.latitude}&lon=${qibah.longitude}`);
    assert.equal(result.matched, true);
    assert.equal(result.best_effort, false);
    assertCityParents(result, qibah);
    assert.equal(result.district, null);
    assert.equal(visitorCalls, 0);
  });
}
