// Run only against a newly created, disposable localhost database. The random
// suffix prevents reuse or deletion of any database that existed before this run.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.AYK_DISTRICTS_TEST_DB;

if (!databasePrefix) {
  test('district coverage integration (set AYK_DISTRICTS_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_districts[a-z0-9_]{0,18}$/.test(databasePrefix)) {
    throw new Error('Use a disposable ayk_test_districts* database prefix.');
  }
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
    DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  });
  const { Client } = require('pg');
  const db = require('../config/database');
  const install = require('../services/installService');
  let server, base, createdDatabase = false;
  const maintenanceClient = () => new Client({
    host: '127.0.0.1', port, user: 'postgres', password: '',
    database: 'postgres', ssl: false, connectionTimeoutMillis: 15000,
  });

  async function api(path, { token, body, method = 'GET', expected = 200 } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  }

  test.before(async () => {
    const admin = maintenanceClient();
    await admin.connect();
    try {
      // databaseName is generated above from validated ASCII characters only.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      createdDatabase = true;
    } finally { await admin.end(); }
    const result = await install.setupFromEnv();
    assert.equal(result.migrations.flatMap(migration => migration.errors).length, 0);
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
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

  test('published geography covers every region, preserves city IDs and filters district ownership', async () => {
    const cities = await api('/cities');
    // Migration 044 opens the whole Kingdom: every Saudi city is selectable.
    const totalCities = Number((await db.queryOne('SELECT COUNT(*) AS n FROM cities')).n);
    assert.equal(cities.length, totalCities);
    assert.equal(new Set(cities.map(city => Number(city.region_id))).size, 13);
    for (const [id, name] of [[9, 'بريدة'], [16, 'عنيزة'], [17, 'الرس']]) {
      assert.equal(cities.find(city => Number(city.id) === id)?.name_ar, name);
    }
    const qassim = await api('/cities?region_id=4');
    assert.equal(qassim.length, 17);
    assert.ok(qassim.every(city => Number(city.region_id) === 4));
    const majmaah = await api('/cities?governorate_id=5');
    assert.equal(majmaah.length, 1);
    assert.equal(majmaah[0].name_ar, 'المجمعة');
    assert.ok(!qassim.some(city => Number(city.id) === Number(majmaah[0].id)));
    const riyadh = await api('/cities?region_id=1');
    assert.ok(riyadh.some(city => Number(city.id) === Number(majmaah[0].id)));
    assert.ok(riyadh.every(city => Number(city.region_id) === 1));

    const qibah = qassim.find(city => city.name_ar === 'قبة');
    assert.ok(qibah, 'A city without a confirmed governorate must remain selectable through its region');
    assert.equal(qibah.governorate_id, null);
    assert.ok(!(await api('/cities?governorate_id=52')).some(city => Number(city.id) === Number(qibah.id)));
    assert.equal((await api(`/districts?city_id=${qibah.id}`)).length, 12);

    const allDistricts = await api('/districts');
    const totalDistricts = Number((await db.queryOne('SELECT COUNT(*) AS n FROM districts')).n);
    assert.equal(allDistricts.length, totalDistricts);
    assert.equal(new Set(allDistricts.map(district => `${district.city_id}:${district.name_ar}`)).size, totalDistricts);
    // The Qassim/Majmaah neighborhood source (database/geography) contains names only.
    const sourceCityIds = new Set([...qassim, ...majmaah].map(city => Number(city.id)));
    assert.ok(allDistricts.filter(district => sourceCityIds.has(Number(district.city_id)))
      .every(district => district.latitude === null && district.longitude === null),
      'The source contains names only; neighborhood GPS coordinates must not be invented');
    for (const [cityId, count] of [[9, 69], [16, 89], [17, 42], [majmaah[0].id, 13]]) {
      const districts = await api(`/districts?city_id=${cityId}`);
      assert.equal(districts.length, count);
      assert.ok(districts.every(district => Number(district.city_id) === Number(cityId)));
    }
    assert.equal((await api('/districts?city_id=16')).filter(district => district.name_ar === 'اليرموك').length, 1);
  });

  test('the selected Majmaah city and district persist through registration and a service request', async () => {
    const [city] = await api('/cities?governorate_id=5');
    const [district] = await api(`/districts?city_id=${city.id}`);
    const customer = await api('/auth/register', {
      method: 'POST', expected: 201,
      body: {
        full_name: 'عميل اختبار أحياء المجمعة',
        username: `district_customer_${crypto.randomBytes(5).toString('hex')}`,
        password: 'DistrictTestOnly-2026', role: 'client',
        country_id: 1, region_id: 1, governorate_id: 5,
        city_id: city.id, district_id: district.id,
      },
    });
    const savedUser = await db.queryOne('SELECT city_id, district_id FROM users WHERE id = ?', [customer.user.id]);
    assert.equal(Number(savedUser.city_id), Number(city.id));
    assert.equal(Number(savedUser.district_id), Number(district.id));
    const request = await api('/requests', {
      method: 'POST', expected: 201, token: customer.token,
      body: {
        title: 'إصلاح تسريب في المجمعة', description: 'طلب صيانة لاختبار حفظ المدينة والحي المختارين',
        category_id: 5, service_id: 13, city_id: city.id, district_id: district.id,
        address: `${city.name_ar}، ${district.name_ar}`,
      },
    });
    const publicRequest = await api(`/requests/${request.id}`);
    assert.equal(Object.hasOwn(publicRequest, 'latitude'), false, 'Public requests redact exact coordinates');
    assert.equal(Object.hasOwn(publicRequest, 'longitude'), false);
    const fetched = await api(`/requests/${request.id}`, { token: customer.token });
    assert.equal(Number(fetched.city_id), Number(city.id));
    assert.equal(Number(fetched.district_id), Number(district.id));
    assert.equal(fetched.city_name, city.name_ar);
    assert.equal(fetched.district_name, district.name_ar);
    assert.equal(fetched.latitude, null);
    assert.equal(fetched.longitude, null);
  });

  test('later migration runs preserve administrator neighborhood edits and inactive filtering', async () => {
    const [district] = await api('/districts?city_id=9');
    const editedName = `${district.name_ar} (مراجعة محلية)`;
    await db.query('UPDATE districts SET name_ar = ?, is_active = 0 WHERE id = ?', [editedName, district.id]);
    const result = await install.runMigrationsFromEnv();
    assert.equal(result.applied.length, 0);
    const persisted = await db.queryOne('SELECT name_ar, is_active FROM districts WHERE id = ?', [district.id]);
    assert.equal(persisted.name_ar, editedName);
    assert.equal(Number(persisted.is_active), 0);
    const active = await api('/districts?city_id=9');
    assert.equal(active.length, 68);
    assert.ok(!active.some(item => Number(item.id) === Number(district.id)));
    const includingInactive = await api('/districts?city_id=9&all=true');
    assert.equal(includingInactive.length, 69);
    assert.equal(includingInactive.find(item => Number(item.id) === Number(district.id))?.name_ar, editedName);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM districts WHERE city_id IN (SELECT id FROM cities WHERE is_active = 1)')).total),
      Number((await db.queryOne('SELECT COUNT(*) AS total FROM districts')).total));
  });
}
