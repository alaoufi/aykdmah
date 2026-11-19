// Source-regression checks use one newly created database on the dedicated
// localhost PostgreSQL test server. Provider responses are stubbed in process.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const databasePrefix = process.env.AYK_SECURITY_CATALOG_TEST_DB || 'ayk_test_catalog';
{
  if (!/^ayk_test_catalog[a-z0-9_]{0,18}$/.test(databasePrefix)) {
    throw new Error('Use a disposable ayk_test_catalog* database prefix.');
  }
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  if (![5432, 55432].includes(port)) throw new Error('Use the dedicated localhost test PostgreSQL port.');
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '',
    WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', PAYMENT_PROVIDER: '',
    PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const ipGeo = require('../services/ipGeoService');
  const Country = require('../models/Country');
  const nativeFetch = global.fetch;
  let createdDatabase = false, server, base, adminToken;
  const maintenanceClient = () => new Client({
    host: '127.0.0.1', port, user: 'postgres', password: '',
    database: 'postgres', ssl: false, connectionTimeoutMillis: 15000,
  });

  test.before(async () => {
    const admin = maintenanceClient();
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      createdDatabase = true;
    } finally { await admin.end(); }
    // These fixtures isolate the model queries; the migration suite separately
    // validates the application's full schema.
    await db.getPool().query(`
      CREATE TABLE countries (id SERIAL PRIMARY KEY, code VARCHAR(2) UNIQUE NOT NULL, name_ar VARCHAR(80), name_en VARCHAR(80), flag_emoji VARCHAR(8), dial_code VARCHAR(8), currency_code VARCHAR(6), currency_symbol VARCHAR(16), languages_enabled JSONB, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE regions (id SERIAL PRIMARY KEY, country_id INTEGER REFERENCES countries(id), code VARCHAR(20), name_ar VARCHAR(120), name_en VARCHAR(120), capital_ar VARCHAR(120), capital_en VARCHAR(120), latitude NUMERIC, longitude NUMERIC, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE governorates (id SERIAL PRIMARY KEY, region_id INTEGER REFERENCES regions(id), name_ar VARCHAR(120), name_en VARCHAR(120), latitude NUMERIC, longitude NUMERIC, sort_order INTEGER DEFAULT 0, is_capital INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE cities (id SERIAL PRIMARY KEY, governorate_id INTEGER REFERENCES governorates(id), region_id INTEGER REFERENCES regions(id), name_ar VARCHAR(120), name_en VARCHAR(120), latitude NUMERIC, longitude NUMERIC, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE districts (id SERIAL PRIMARY KEY, city_id INTEGER REFERENCES cities(id), name_ar VARCHAR(120), name_en VARCHAR(120), latitude NUMERIC, longitude NUMERIC, is_active INTEGER DEFAULT 1);
      CREATE TABLE categories (id SERIAL PRIMARY KEY, name_ar VARCHAR(150), name_en VARCHAR(150), slug VARCHAR(160) UNIQUE, icon VARCHAR(255), color VARCHAR(20), description TEXT, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, name_translations JSONB, description_translations JSONB, deleted_at TIMESTAMP);
      CREATE TABLE services (id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id), name_ar VARCHAR(150), name_en VARCHAR(150), slug VARCHAR(160) UNIQUE, icon VARCHAR(255), description TEXT, base_price NUMERIC(10,2), sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, is_urgent_supported INTEGER DEFAULT 1, name_translations JSONB, description_translations JSONB, deleted_at TIMESTAMP);
      CREATE TABLE users (id INTEGER PRIMARY KEY, city_id INTEGER REFERENCES cities(id), full_name TEXT DEFAULT 'Fixture Admin', email TEXT, phone TEXT, role TEXT DEFAULT 'admin', is_active INTEGER DEFAULT 1, is_blocked INTEGER DEFAULT 0, avatar TEXT, is_super_admin INTEGER DEFAULT 1, permissions JSONB DEFAULT '[]', auth_version INTEGER DEFAULT 0, deleted_at TIMESTAMP);
      CREATE TABLE settings (setting_key TEXT PRIMARY KEY, setting_value TEXT, setting_type TEXT);
      CREATE TABLE ip_geo_cache (ip TEXT PRIMARY KEY, country TEXT, country_name TEXT, region TEXT, region_id INTEGER, city TEXT, latitude NUMERIC, longitude NUMERIC, provider TEXT, resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO countries (id, code, name_ar, name_en) VALUES (1, 'BH', 'البحرين', 'Bahrain'), (2, 'SD', 'السودان', 'Sudan');
      INSERT INTO regions (id, country_id, name_ar, name_en) VALUES (11, 1, 'الشمالية', 'Northern'), (12, 2, 'الشمالية', 'Northern');
      INSERT INTO cities (id, region_id, name_ar, name_en) VALUES (21, 12, 'دنقلا', 'Dongola');
      INSERT INTO governorates (id, region_id, name_ar) VALUES (22, 11, 'محافظة اختبار');
      INSERT INTO cities (id, governorate_id, name_ar, name_en) VALUES (23, 22, 'مدينة اختبار', 'Fixture City');
      INSERT INTO users (id, city_id) VALUES (31, 21);
      INSERT INTO users (id, city_id) VALUES (32, 23);
      INSERT INTO districts (id, city_id, name_ar) VALUES (24, 21, 'حي اختبار');
      INSERT INTO categories (id, name_ar, slug) VALUES (41, 'قسم اختبار', 'fixture-category');
      INSERT INTO services (id, category_id, name_ar, slug) VALUES (51, 41, 'خدمة اختبار', 'fixture-service');
      INSERT INTO settings (setting_key, setting_value, setting_type) VALUES ('ads_geo_provider', 'ip-api', 'string'), ('ads_geo_cache_days', '14', 'number');
    `);
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use(require('../utils/i18n').localeMiddleware);
    for (const kind of ['category', 'service', 'country', 'region', 'governorate', 'city', 'district']) {
      const path = { category: 'categories', country: 'countries', city: 'cities' }[kind] || `${kind}s`;
      app.use(`/${path}`, require(`../routes/${kind}Routes`));
    }
    app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
      res.status(err.status || 500).json({ success: false, message: err.message });
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    adminToken = require('../utils/jwt').sign({ id: 31, role: 'admin', auth_version: 0 });
  });

  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const admin = maintenanceClient();
      await admin.connect();
      try { await admin.query(`DROP DATABASE "${databaseName}"`); }
      finally { await admin.end(); }
    }
  });

  test('IP-region matches and their cache remain scoped to the reported country', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.hostname, 'ip-api.com');
      calls.push(parsed.pathname);
      const countryCode = parsed.pathname.endsWith('/203.0.113.11') ? 'BH' : 'SD';
      return { ok: true, json: async () => ({ status: 'success', countryCode, regionName: 'Northern', city: 'fixture', lat: 19, lon: 30 }) };
    };
    try {
      const [bahrain, sudan] = await Promise.all([
        ipGeo.lookup('203.0.113.11'), ipGeo.lookup('203.0.113.12'),
      ]);
      assert.equal(Number(bahrain.region_id), 11);
      assert.equal(Number(sudan.region_id), 12, 'Sudanese Northern must not inherit Bahrain Northern from the label cache');
      assert.equal(calls.length, 2);
    } finally { global.fetch = originalFetch; }
  });

  test('a saved city attached directly to a region resolves that region for ad targeting', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('No provider request is permitted for a saved city'); };
    try {
      const geo = await ipGeo.resolveVisitorGeo({ user: { id: 31 } });
      assert.equal(geo.source, 'user_profile');
      assert.equal(geo.city, 'دنقلا');
      assert.equal(Number(geo.region_id), 12, 'direct region attachment must survive profile lookup');
      assert.equal(geo.region, 'الشمالية');
      assert.equal(geo.country, 'SD');
      assert.equal(geo.country_name, 'Sudan');
      const governorateGeo = await ipGeo.resolveVisitorGeo({ user: { id: 32 } });
      assert.equal(Number(governorateGeo.region_id), 11);
      assert.equal(governorateGeo.country, 'BH');
      assert.equal(governorateGeo.country_name, 'Bahrain');
    } finally { global.fetch = originalFetch; }
  });

  test('ambiguous names and inactive geography do not resolve an arbitrary region', async () => {
    await db.query("INSERT INTO countries (id, code, is_active) VALUES (3, 'AE', 0)");
    await db.query(`INSERT INTO regions (id, country_id, name_ar, name_en, is_active) VALUES
      (13, 1, 'المنطقة الأولى', 'Shared Area', 1),
      (14, 1, 'المنطقة الثانية', 'Shared Area', 1),
      (15, 1, 'غير نشط', 'Inactive Region', 0),
      (16, 3, 'دولة غير نشطة', 'Disabled Country', 1)`);
    const originalFetch = global.fetch;
    const responses = [
      { countryCode: 'BH', regionName: 'Shared Area' },
      { countryCode: 'BH', regionName: 'Area Region' },
      { countryCode: 'BH', regionName: 'Inactive Region' },
      { countryCode: 'AE', regionName: 'Disabled Country' },
    ];
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'success', ...responses.shift() }) });
    try {
      for (const ip of ['203.0.113.21', '203.0.113.22', '203.0.113.23', '203.0.113.24']) {
        assert.equal((await ipGeo.lookup(ip)).region_id, null);
      }
    } finally { global.fetch = originalFetch; }
  });

  test('legacy IP-cache region IDs are corrected using their cached country', async () => {
    await db.query('INSERT INTO ip_geo_cache (ip, country, region, region_id) VALUES (?, ?, ?, ?)',
      ['203.0.113.31', 'SD', 'Northern', 11]);
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('The legacy-cache test must not call any provider'); };
    try {
      assert.equal(Number((await ipGeo.lookup('203.0.113.31')).region_id), 12);
    } finally { global.fetch = originalFetch; }
  });

  test('cached IP lookups respect later disabled regions and new name ambiguity', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('Saved IP cache must not call any provider'); };
    try {
      assert.equal(Number((await ipGeo.lookup('203.0.113.11')).region_id), 11);
      await db.query('UPDATE regions SET is_active = 0 WHERE id = 11');
      assert.equal((await ipGeo.lookup('203.0.113.11')).region_id, null);
      await db.query('UPDATE regions SET is_active = 1 WHERE id = 11');
      await db.query("INSERT INTO regions (id, country_id, name_ar, name_en) VALUES (17, 1, 'شمالية إضافية', 'Northern')");
      assert.equal((await ipGeo.lookup('203.0.113.11')).region_id, null);
    } finally {
      await db.query('UPDATE regions SET is_active = 1 WHERE id = 11');
      await db.query('DELETE FROM regions WHERE id = 17');
      global.fetch = originalFetch;
    }
  });

  test('public-country listing and ensureSeed compatibility execute inside a read-only transaction', async () => {
    const client = new Client({
      host: '127.0.0.1', port, user: 'postgres', password: '',
      database: databaseName, ssl: false, connectionTimeoutMillis: 15000,
    });
    await client.connect();
    const pool = db.getPool(), originalQuery = pool.query;
    const env = require('../config/env'), originalAutoMigrate = env.AUTO_MIGRATE;
    try {
      await client.query('BEGIN READ ONLY');
      pool.query = (...args) => client.query(...args);
      env.AUTO_MIGRATE = true;
      await Country.ensureSeed();
      const countries = await Country.listAll({ activeOnly: true });
      assert.deepEqual(countries.map(country => country.code).sort(), ['BH', 'SD']);
      assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM regions')).total), 6);
    } finally {
      pool.query = originalQuery;
      env.AUTO_MIGRATE = originalAutoMigrate;
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  async function api(path, body, method = 'POST', expected = 400) {
    const response = await nativeFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${result.message}`);
    return result.data;
  }

  async function snapshotCatalog() {
    const tables = ['categories', 'services', 'countries', 'regions', 'governorates', 'cities', 'districts'];
    const rows = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table} ORDER BY id`)));
    return JSON.stringify(rows);
  }

  test('malformed authenticated catalog writes return 400 without mutations or translation requests', async () => {
    const before = await snapshotCatalog();
    let providerCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => { providerCalls++; throw new Error('Invalid input must not call a translation provider'); };
    const cases = [
      ['/categories', { name_ar: { value: 'bad' } }],
      ['/categories', { name_ar: '  ' }],
      ['/categories', { name_ar: 'x'.repeat(151) }],
      ['/categories', { name_ar: 'قسم', color: 'x'.repeat(21) }],
      ['/categories', { name_ar: 'قسم', icon: ['bad'] }],
      ['/categories', { name_ar: 'قسم', is_active: 'false' }],
      ['/categories', { name_ar: 'قسم', sort_order: 'Infinity' }],
      ['/categories/41', { name_translations: { ar: { value: 'bad' } } }, 'PUT'],
      ['/categories/41', { name_translations: { fr: 'Unsupported' } }, 'PUT'],
      ['/categories/41', { description_translations: ['bad'] }, 'PUT'],
      ['/categories/41', { name_ar: null }, 'PUT'],
      ['/categories/0', { is_active: false }, 'PUT'],
      ['/services', { name_ar: 'خدمة', category_id: [41] }],
      ['/services', { name_ar: 'خدمة', category_id: 999 }],
      ['/services', { name_ar: 'خدمة', category_id: 41, is_urgent_supported: 'false' }],
      ['/services', { name_ar: 'خدمة', category_id: 41, base_price: -1 }],
      ['/services', { name_ar: 'خدمة', category_id: 41, base_price: 100000000 }],
      ['/services/51', { base_price: {} }, 'PUT'],
      ['/countries', { code: 'ZZ', name_ar: 'دولة', name_en: 'Country', currency_code: 'SARS' }],
      ['/countries/1', { code: 'A1' }, 'PUT'],
      ['/countries/1', { name_en: 'x'.repeat(81) }, 'PUT'],
      ['/countries/1', { languages_enabled: ['ar', 'fr'] }, 'PUT'],
      ['/countries/1', { languages_enabled: 'ar' }, 'PUT'],
      ['/regions', { name_ar: 'منطقة', latitude: true }],
      ['/regions', { name_ar: 'منطقة', longitude: 181 }],
      ['/regions', { name_ar: 'منطقة', country_id: {} }],
      ['/regions/11', { sort_order: 2147483648 }, 'PUT'],
      ['/regions/reorder', { ids: [11, 11] }],
      ['/countries/reorder', { ids: [1, 'Infinity'] }],
      ['/cities/reorder', { ids: [[21]] }],
      ['/governorates', { name_ar: 'محافظة', region_id: 0 }],
      ['/governorates/22', { region_id: 999 }, 'PUT'],
      ['/cities', { name_ar: 'مدينة', region_id: 12, governorate_id: 22 }],
      ['/cities/21', { governorate_id: 22 }, 'PUT'],
      ['/districts', { name_ar: 'حي', city_id: 999 }],
      ['/districts/24', { name_ar: 'x'.repeat(121) }, 'PUT'],
    ];
    try {
      for (const [path, body, method] of cases) await api(path, body, method);
      assert.equal(providerCalls, 0);
      assert.equal(await snapshotCatalog(), before);
    } finally { global.fetch = originalFetch; }
  });

  test('valid UI payloads retain false flags, zero values, nullable fields and supported translations', async () => {
    for (const table of ['categories', 'services', 'countries', 'regions', 'governorates', 'cities', 'districts']) {
      await db.query('SELECT setval(pg_get_serial_sequence(?, ?), (SELECT MAX(id) FROM ' + table + '))', [table, 'id']);
    }
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.equal(new URL(url).hostname, 'api.mymemory.translated.net');
      return { ok: true, json: async () => ({ responseData: { translatedText: 'Fixture Label' } }) };
    };
    try {
      const category = await api('/categories', { name_ar: ' قسم جديد ', icon: '', color: '', description: '', sort_order: '0', is_active: false }, 'POST', 201);
      assert.equal(category.name_ar, 'قسم جديد');
      assert.equal(category.is_active, 0);
      const service = await api('/services', { name_ar: 'خدمة جديدة', category_id: String(category.id), base_price: '0', is_urgent_supported: '0', is_active: '0', sort_order: 0 }, 'POST', 201);
      assert.equal(service.is_urgent_supported, 0);
      assert.equal(service.is_active, 0);
      assert.equal(Number(service.base_price), 0);
      const country = await api('/countries', { code: 'zz', name_ar: 'دولة اختبار', name_en: 'Test Country', currency_code: 'sar', languages_enabled: ['ar', 'en'], is_active: '0', sort_order: 0, dial_code: '' }, 'POST', 201);
      assert.equal(country.code, 'ZZ');
      assert.equal(country.currency_code, 'SAR');
      assert.equal(country.is_active, 0);
      assert.equal(country.sort_order, 0);
      const governorate = await api('/governorates', { name_ar: 'محافظة جديدة', region_id: 11, is_capital: false, is_active: false, latitude: 0, longitude: '0' }, 'POST', 201);
      assert.equal(governorate.is_capital, 0);
      assert.equal(governorate.is_active, 0);
      assert.equal(Number(governorate.latitude), 0);
      assert.equal(Number(governorate.longitude), 0);
      const city = await api('/cities', { name_ar: 'مدينة جديدة', name_en: '', region_id: '12', governorate_id: '', latitude: '', longitude: null, is_active: true }, 'POST', 201);
      assert.equal(city.name_en, null);
      assert.equal(city.governorate_id, null);
      assert.equal(city.latitude, null);
      const district = await api('/districts', { name_ar: 'حي جديد', city_id: city.id, latitude: 0, longitude: 0, is_active: '0' }, 'POST', 201);
      assert.equal(district.is_active, 0);
      assert.equal(Number(district.latitude), 0);
      const region = await api('/regions', { name_ar: 'منطقة جديدة', country_id: 2, code: '', name_en: '', latitude: '', longitude: '', sort_order: '0', is_active: '0' }, 'POST', 201);
      assert.equal(region.is_active, 0);
      assert.equal(region.code, null);
      const updated = await api(`/categories/${category.id}`, { name_translations: { ar: 'قسم جديد', en: 'Updated label' }, description_translations: null, ignored: { nested: 'value' } }, 'PUT', 200);
      assert.equal(updated.name_translations.en, 'Updated label');
      assert.equal(updated.description_translations, null);
      const changed = await api(`/services/${service.id}`, { is_active: false, is_urgent_supported: false, base_price: '' }, 'PUT', 200);
      assert.equal(changed.is_urgent_supported, 0);
      assert.equal(changed.base_price, null);
    } finally { global.fetch = originalFetch; }
  });
}
