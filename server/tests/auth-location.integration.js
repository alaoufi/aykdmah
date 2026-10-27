// Run only against a newly created, disposable localhost database. The random
// suffix prevents reuse or deletion of any database that existed before this run.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.AYK_AUTH_LOCATION_TEST_DB;

if (!databasePrefix) {
  test('auth/location integration (set AYK_AUTH_LOCATION_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_authlocation[a-z0-9_]{0,18}$/.test(databasePrefix)) {
    throw new Error('Use a disposable ayk_test_authlocation* database prefix.');
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
  const { comparePassword } = require('../utils/hash');
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

  test.beforeEach(async () => {
    // Each case has its own auth-attempt budget in this disposable database.
    await db.query('DELETE FROM auth_rate_limits');
  });

  const password = 'LocalLocationVerification-2026';
  const identity = () => `local_profile_${crypto.randomBytes(6).toString('hex')}`;
  const register = (body) => api('/auth/register', { method: 'POST', expected: 201, body: {
    full_name: 'اختبار محلي للموقع', username: identity(), password, role: 'client', ...body,
  } });
  const registrationAttempt = async body => {
    const response = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'محاولة تسجيل محلية', password, role: 'client', ...body }),
    });
    return { status: response.status, result: await response.json() };
  };

  const savedProviderLocation = userId => db.queryOne(
    'SELECT location_mode, fixed_latitude, fixed_longitude, fixed_address FROM provider_profiles WHERE user_id = ?',
    [userId],
  );

  const serviceSelection = async () => {
    const category = await db.queryOne(`SELECT c.id FROM categories c JOIN services s ON s.category_id = c.id
      WHERE c.is_active = 1 AND c.deleted_at IS NULL AND s.is_active = 1 AND s.deleted_at IS NULL
      GROUP BY c.id HAVING COUNT(s.id) >= 2 ORDER BY c.id LIMIT 1`);
    const services = await db.query('SELECT id FROM services WHERE category_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 2', [category.id]);
    const district = await db.queryOne('SELECT id FROM districts WHERE city_id = 9 AND is_active = 1 ORDER BY id LIMIT 1');
    return { category_id: Number(category.id), service_ids: services.map(row => Number(row.id)), district_id: Number(district.id) };
  };
  const phoneIdentity = () => `05${crypto.randomInt(10000000, 99999999)}`;

  test('phone-only provider onboarding saves multiple services atomically and signs in without an email or username', async () => {
    const selection = await serviceSelection();
    const phone = phoneIdentity();
    const session = await register({ role: 'provider', phone, ...selection,
      email: `${identity()}@example.test`, facebook_id: identity(), service_ids: [...selection.service_ids, selection.service_ids[0]],
    });
    for (const data of [session, await api('/auth/login', { method: 'POST', body: { identifier: phone, password } }),
      await api('/auth/me', { token: session.token })]) {
      assert.equal(data.user.phone, phone);
      for (const field of ['username', 'email', 'facebook_id']) assert.equal(data.user[field], null);
    }
    const profile = await db.queryOne('SELECT category_id, service_ids FROM provider_profiles WHERE user_id = ?', [session.user.id]);
    assert.equal(Number(profile.category_id), selection.category_id);
    assert.deepEqual(profile.service_ids, selection.service_ids);
    const account = await db.queryOne('SELECT phone_verified_at, is_verified FROM users WHERE id = ?', [session.user.id]);
    assert.equal(account.phone_verified_at, null, 'Saving a phone is not proof of phone ownership');
    assert.equal(Number(account.is_verified), 0);
  });

  test('provider onboarding rejects missing phone, area, malformed IDs and services outside the active profession before creating an account', async () => {
    const selection = await serviceSelection();
    const other = await db.queryOne('SELECT s.id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.category_id <> ? AND s.is_active = 1 AND s.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL LIMIT 1', [selection.category_id]);
    const inactive = (await db.getPool().query("INSERT INTO services(category_id,name_ar,slug,is_active) VALUES ($1,'خدمة غير نشطة',$2,0) RETURNING id", [selection.category_id, identity()])).rows[0];
    const deleted = (await db.getPool().query("INSERT INTO services(category_id,name_ar,slug,is_active,deleted_at) VALUES ($1,'خدمة محذوفة',$2,1,CURRENT_TIMESTAMP) RETURNING id", [selection.category_id, identity()])).rows[0];
    const inactiveCategory = (await db.getPool().query("INSERT INTO categories(name_ar,slug,is_active) VALUES ('مهنة غير نشطة',$1,0) RETURNING id", [identity()])).rows[0];
    const cases = [
      { phone: undefined }, { phone: '+' }, { phone: '123' }, { phone: '+1234567890123456' },
      { district_id: undefined }, { district_id: undefined, city_id: 9 },
      { category_id: null }, { category_id: true }, { category_id: [selection.category_id] }, { category_id: {} },
      { category_id: Number(inactiveCategory.id) }, { category_id: 99999999 }, { category_id: 2147483648 },
      { service_ids: [] }, { service_ids: null }, { service_ids: '1' }, { service_ids: [true] },
      { service_ids: [[selection.service_ids[0]]] }, { service_ids: [99999999] }, { service_ids: [2147483648] },
      { service_ids: [Number(other.id)] }, { service_ids: [Number(inactive.id)] }, { service_ids: [Number(deleted.id)] },
      { service_ids: Array(51).fill(selection.service_ids[0]) },
    ];
    for (const invalid of cases) {
      const before = await db.queryOne('SELECT COUNT(*)::int AS count FROM users');
      const attempt = await registrationAttempt({ role: 'provider', phone: phoneIdentity(), ...selection, ...invalid });
      assert.ok(attempt.status >= 400 && attempt.status < 500, JSON.stringify({ invalid, status: attempt.status }));
      assert.equal((await db.queryOne('SELECT COUNT(*)::int AS count FROM users')).count, before.count);
    }
  });

  test('provider profession editing resets old services and validates replacements without mutating rejected profiles', async () => {
    const selection = await serviceSelection();
    const session = await register({ role: 'provider', phone: phoneIdentity(), ...selection });
    const other = await db.queryOne('SELECT s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.category_id <> ? AND s.is_active = 1 AND s.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL LIMIT 1', [selection.category_id]);
    let saved = await api('/users/me/provider', { method: 'PUT', token: session.token, body: { category_id: Number(other.category_id) } });
    assert.deepEqual(saved.service_ids, []);
    saved = await api('/users/me/provider', { method: 'PUT', token: session.token, body: { service_ids: [String(other.id), Number(other.id)] } });
    assert.deepEqual(saved.service_ids, [Number(other.id)]);
    for (const body of [{ service_ids: selection.service_ids }, { service_ids: [true] }, { category_id: true }, { category_id: [other.category_id] }]) {
      await api('/users/me/provider', { method: 'PUT', token: session.token, body, expected: 400 });
      const current = await api('/auth/me', { token: session.token });
      assert.equal(Number(current.provider.category_id), Number(other.category_id));
      assert.deepEqual(current.provider.service_ids, [Number(other.id)]);
    }
  });

  test('new phone onboarding reports a duplicate phone field and client signups cannot set provider services', async () => {
    const selection = await serviceSelection();
    const phone = phoneIdentity();
    await register({ role: 'provider', phone, ...selection });
    const duplicate = await registrationAttempt({ role: 'provider', phone: ` ${phone.slice(0, 3)} ${phone.slice(3)} `, ...selection });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(duplicate.result.errors.map(item => item.field), ['phone']);
    const client = await register({ ...selection, service_ids: [true], category_id: {}, phone: phoneIdentity() });
    assert.equal(client.user.role, 'client');
    assert.equal((await api('/auth/me', { token: client.token })).provider, null);
    assert.equal(await db.queryOne('SELECT user_id FROM provider_profiles WHERE user_id = ?', [client.user.id]), null);
  });

  test('both roles return saved hierarchy and coordinates through registration, login and refresh', async () => {
    const [district] = await api('/districts?city_id=9');
    for (const role of ['client', 'provider']) {
      const username = identity();
      const session = await register({ role, username, district_id: district.id, latitude: 26.35, longitude: 43.97 });
      for (const data of [session, await api('/auth/login', { method: 'POST', body: { identifier: username, password } }),
        await api('/auth/me', { token: session.token })]) {
        const user = data.user;
        assert.equal(Number(user.country_id), 1);
        assert.equal(Number(user.region_id), 4);
        assert.equal(Number(user.governorate_id), 46);
        assert.equal(Number(user.city_id), 9);
        assert.equal(Number(user.district_id), Number(district.id));
        assert.equal(user.city_name_ar, 'بريدة');
        assert.ok(user.city_name_en && user.region_name_ar && user.country_name_ar && user.district_name_ar);
        assert.equal(Number(user.latitude), 26.35);
        assert.equal(Number(user.longitude), 43.97);
        assert.equal(user.password_hash, undefined);
      }
    }
  });

  test('profile edits preserve unchanged GPS and save/derive hierarchy while rejecting inconsistent IDs', async () => {
    const [district] = await api('/districts?city_id=9');
    const [unaizahDistrict] = await api('/districts?city_id=16');
    const session = await register({ city_id: 9, district_id: district.id, latitude: 26.35, longitude: 43.97, phone: '0501111111' });
    const token = session.token;
    let saved = await api('/users/me', { token, method: 'PUT', body: { full_name: 'اسم جديد للاختبار' } });
    assert.equal(Number(saved.latitude), 26.35);
    assert.equal(Number(saved.district_id), Number(district.id));
    await api('/users/me', { token, method: 'PUT', expected: 400, body: { city_id: 9, district_id: unaizahDistrict.id } });
    await api('/users/me', { token, method: 'PUT', expected: 400, body: { region_id: 1, city_id: 9 } });
    saved = await api('/users/me', { token, method: 'PUT', body: { city_id: 16, district_id: unaizahDistrict.id } });
    assert.equal(Number(saved.region_id), 4);
    assert.equal(Number(saved.governorate_id), 47);
    assert.equal(saved.latitude, null);
    assert.equal(saved.longitude, null);
    const qibah = (await api('/cities?region_id=4')).find(city => city.name_ar === 'قبة');
    saved = await api('/users/me', { token, method: 'PUT', body: { city_id: qibah.id } });
    assert.equal(saved.governorate_id, null);
    assert.equal(saved.district_id, null);
    assert.equal(Number(saved.region_id), 4);
    assert.equal(Number(saved.country_id), 1);
    const other = await register({ phone: '0502222222' });
    await api('/users/me', { token, method: 'PUT', expected: 409, body: { phone: '0502222222' } });
    assert.equal((await api('/auth/me', { token })).user.phone, '0501111111');
    assert.equal((await api('/auth/me', { token: other.token })).user.phone, '0502222222');
  });

  test('invalid or inactive geography and partial/out-of-range coordinates never create accounts', async () => {
    const invalids = [
      { region_id: 1, city_id: 9 }, { city_id: 999999999 },
      { latitude: 91, longitude: 43 }, { latitude: 26.3 },
      { latitude: true, longitude: 43 }, { city_id: true },
    ];
    for (const fields of invalids) {
      const username = identity();
      await api('/auth/register', { method: 'POST', expected: 400, body: { full_name: 'اختبار غير صالح', username, password, role: 'client', ...fields } });
      assert.equal(await db.queryOne('SELECT id FROM users WHERE username = ?', [username]), null);
    }
    const [district] = await api('/districts?city_id=9');
    await db.query('UPDATE districts SET is_active = 0 WHERE id = ?', [district.id]);
    await api('/auth/register', { method: 'POST', expected: 400, body: { full_name: 'اختبار حي معطل', username: identity(), password, role: 'client', district_id: district.id } });
    await db.query('UPDATE districts SET is_active = 1 WHERE id = ?', [district.id]);
  });

  test('provider registration saves fixed, mobile and both modes without publishing private GPS as a work location', async () => {
    const cases = [
      { fields: {}, mode: 'mobile', address: null },
      { fields: { location_mode: 'mobile', fixed_address: 'عنوان لا ينشر للتنقل' }, mode: 'mobile', address: null },
      { fields: { location_mode: 'fixed' }, mode: 'fixed', address: null },
      { fields: { location_mode: 'fixed', fixed_address: null }, mode: 'fixed', address: null },
      { fields: { location_mode: 'fixed', fixed_address: 'ع'.repeat(255) }, mode: 'fixed', address: 'ع'.repeat(255) },
      { fields: { location_mode: 'both', fixed_address: 'عنوان مقر الخدمة' }, mode: 'both', address: 'عنوان مقر الخدمة' },
      { fields: { location_mode: 'both', fixed_address: null }, mode: 'both', address: null },
    ];
    for (const { fields, mode, address } of cases) {
      const session = await register({ role: 'provider', latitude: 26.35, longitude: 43.97, ...fields });
      const refreshed = await api('/auth/me', { token: session.token });
      assert.equal(Number(refreshed.user.latitude), 26.35);
      assert.equal(Number(refreshed.user.longitude), 43.97);
      assert.equal(refreshed.provider.location_mode, mode);
      assert.equal(refreshed.provider.fixed_address, address);
      assert.equal(refreshed.provider.fixed_latitude, null);
      assert.equal(refreshed.provider.fixed_longitude, null);
      assert.deepEqual(await savedProviderLocation(session.user.id), {
        location_mode: mode, fixed_address: address, fixed_latitude: null, fixed_longitude: null,
      });
    }
  });

  test('provider registration saves the chosen service place for fixed and both, ignores it for mobile and rejects bad points', async () => {
    for (const location_mode of ['fixed', 'both']) {
      const session = await register({ role: 'provider', location_mode, fixed_latitude: 24.7136, fixed_longitude: 46.6753 });
      const saved = await savedProviderLocation(session.user.id);
      assert.equal(saved.location_mode, location_mode);
      assert.equal(Number(saved.fixed_latitude), 24.7136);
      assert.equal(Number(saved.fixed_longitude), 46.6753);
    }
    const mobile = await register({ role: 'provider', location_mode: 'mobile', fixed_latitude: 24.7136, fixed_longitude: 46.6753 });
    assert.deepEqual(await savedProviderLocation(mobile.user.id), {
      location_mode: 'mobile', fixed_address: null, fixed_latitude: null, fixed_longitude: null,
    });
    const invalids = [
      { fixed_latitude: 24.7 }, { fixed_longitude: 46.6 }, { fixed_latitude: 91, fixed_longitude: 46.6 },
      { fixed_latitude: 24.7, fixed_longitude: 181 }, { fixed_latitude: '', fixed_longitude: 46.6 },
      { fixed_latitude: true, fixed_longitude: 46.6 }, { fixed_latitude: 'abc', fixed_longitude: 46.6 },
    ];
    for (const fields of invalids) {
      const username = identity();
      const attempt = await registrationAttempt({ username, role: 'provider', location_mode: 'fixed', ...fields });
      assert.equal(attempt.status, 400, JSON.stringify(fields));
      assert.equal(await db.queryOne('SELECT id FROM users WHERE username = ?', [username]), null);
    }
  });

  test('invalid provider modes and addresses reject registration before creating any account or provider profile', async () => {
    const invalids = [
      ...['invalid', '', null, true, 1, [], {}].map(location_mode => ({ location_mode })),
      ...[true, 123, [], {}, 'ع'.repeat(256)].map(fixed_address => ({ location_mode: 'fixed', fixed_address })),
      { location_mode: 'both', fixed_address: 'ع'.repeat(256) },
      { location_mode: 'mobile', fixed_address: true },
      { fixed_address: 'ع'.repeat(256) },
    ];
    const countBefore = Number((await db.queryOne('SELECT COUNT(*) AS total FROM provider_profiles')).total);
    for (const fields of invalids) {
      const username = identity();
      const attempt = await registrationAttempt({ username, role: 'provider', ...fields });
      assert.equal(attempt.status, 400, JSON.stringify(fields));
      assert.equal(attempt.result.success, false);
      assert.equal(await db.queryOne('SELECT id FROM users WHERE username = ?', [username]), null);
    }
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM provider_profiles')).total), countBefore);
  });

  test('client registration ignores invalid provider-specific modes and work location fields', async () => {
    for (const location_mode of ['invalid', null, true, {}]) {
      const session = await register({
        role: 'client', location_mode, fixed_address: { invalid: true },
        fixed_latitude: 'invalid', fixed_longitude: true,
        latitude: 26.35, longitude: 43.97,
      });
      const refreshed = await api('/auth/me', { token: session.token });
      assert.equal(refreshed.user.role, 'client');
      assert.equal(Number(refreshed.user.latitude), 26.35);
      assert.equal(Number(refreshed.user.longitude), 43.97);
      assert.equal(refreshed.provider, null);
      assert.equal(await savedProviderLocation(session.user.id), null);
    }
  });

  test('fixed and both work locations survive unrelated edits and mode switches, while mobile clears every work location field', async () => {
    const session = await register({ role: 'provider', latitude: 0, longitude: 0 });
    const token = session.token;
    assert.equal(Number(session.user.latitude), 0);
    assert.equal(Number(session.user.longitude), 0);
    await api('/users/me/provider', { token, method: 'PUT', body: { location_mode: 'fixed', fixed_latitude: 26.2, fixed_longitude: 43.8, fixed_address: 'عنوان اختبار', business_name: 'اختبار خدمات' } });
    for (const location_mode of ['both', 'fixed', 'both']) {
      await api('/users/me/provider', { token, method: 'PUT', body: { location_mode } });
      await api('/users/me/provider', { token, method: 'PUT', body: { bio: 'نبذة جديدة' } });
      const profile = (await api('/auth/me', { token })).provider;
      assert.equal(profile.location_mode, location_mode);
      assert.equal(Number(profile.fixed_latitude), 26.2);
      assert.equal(Number(profile.fixed_longitude), 43.8);
      assert.equal(profile.fixed_address, 'عنوان اختبار');
    }
    const beforeInvalid = await savedProviderLocation(session.user.id);
    for (const body of [
      { location_mode: 'invalid' }, { location_mode: null }, { location_mode: true }, { location_mode: [] },
      { fixed_address: true }, { fixed_address: 'ع'.repeat(256) },
      { fixed_latitude: 100, fixed_longitude: 43.8 },
    ]) {
      await api('/users/me/provider', { token, method: 'PUT', expected: 400, body });
      assert.deepEqual(await savedProviderLocation(session.user.id), beforeInvalid);
    }
    await api('/users/me/provider', { token, method: 'PUT', body: { fixed_latitude: 0, fixed_longitude: 0, fixed_address: null } });
    let profile = (await api('/auth/me', { token })).provider;
    assert.equal(Number(profile.fixed_latitude), 0);
    assert.equal(Number(profile.fixed_longitude), 0);
    assert.equal(profile.fixed_address, null);
    await api('/users/me/provider', { token, method: 'PUT', body: {
      location_mode: 'mobile', fixed_latitude: 26.4, fixed_longitude: 44, fixed_address: 'عنوان يجب حذفه',
    } });
    assert.deepEqual(await savedProviderLocation(session.user.id), {
      location_mode: 'mobile', fixed_latitude: null, fixed_longitude: null, fixed_address: null,
    });
    // Older rows can contain work-location fields despite being mobile. An
    // unrelated save must also remove those stale values from the profile.
    await db.query('UPDATE provider_profiles SET fixed_latitude = ?, fixed_longitude = ?, fixed_address = ? WHERE user_id = ?',
      [26.4, 44, 'عنوان قديم للتنقل', session.user.id]);
    await api('/users/me/provider', { token, method: 'PUT', body: { bio: 'تحديث مقدم متنقل' } });
    assert.deepEqual(await savedProviderLocation(session.user.id), {
      location_mode: 'mobile', fixed_latitude: null, fixed_longitude: null, fixed_address: null,
    });
    const refreshed = await api('/auth/me', { token });
    assert.equal(Number(refreshed.user.latitude), 0);
    assert.equal(Number(refreshed.user.longitude), 0);
  });

  test('public provider profiles expose service mode and work address without private GPS or account details', async () => {
    const username = identity();
    const provider = await register({
      role: 'provider', username, email: `${username}@example.invalid`, phone: '0504444444',
      latitude: 26.35, longitude: 43.97, location_mode: 'both', fixed_address: 'عنوان عمل عام',
    });
    const client = await register({ role: 'client' });
    await api('/users/me/provider', { token: provider.token, method: 'PUT', body: { fixed_latitude: 26.2, fixed_longitude: 43.8 } });
    const owner = await api(`/users/${provider.user.id}`, { token: provider.token });
    assert.equal(Number(owner.user.latitude), 26.35);
    assert.equal(owner.user.email, `${username}@example.invalid`);
    assert.equal(Number(owner.provider.fixed_latitude), 26.2);
    for (const location_mode of ['both', 'fixed', 'mobile']) {
      await api('/users/me/provider', { token: provider.token, method: 'PUT', body: { location_mode } });
      for (const token of [undefined, client.token]) {
        const publicProfile = await api(`/users/${provider.user.id}`, { token });
        assert.equal(publicProfile.provider.location_mode, location_mode);
        assert.equal(publicProfile.provider.fixed_address, location_mode === 'mobile' ? null : 'عنوان عمل عام');
        for (const field of ['latitude', 'longitude', 'password_hash', 'email', 'phone', 'username', 'facebook_id', 'auth_version']) {
          assert.equal(Object.hasOwn(publicProfile.user, field), false, `Public user exposed ${field}`);
        }
        for (const field of ['fixed_latitude', 'fixed_longitude', 'email', 'phone']) {
          assert.equal(Object.hasOwn(publicProfile.provider, field), false, `Public provider exposed ${field}`);
        }
      }
    }
  });

  test('provider work location updates require the provider role and cannot target another provider', async () => {
    const own = await register({ role: 'provider', location_mode: 'both', fixed_address: 'عنوان مقدم أول' });
    const other = await register({ role: 'provider', location_mode: 'fixed', fixed_address: 'عنوان مقدم آخر' });
    const client = await register({ role: 'client' });
    const otherBefore = await savedProviderLocation(other.user.id);
    await api('/users/me/provider', { method: 'PUT', expected: 401, body: { location_mode: 'both' } });
    await api('/users/me/provider', { token: client.token, method: 'PUT', expected: 403, body: {
      user_id: other.user.id, location_mode: 'mobile',
    } });
    await api('/users/me/provider', { token: own.token, method: 'PUT', body: {
      user_id: other.user.id, location_mode: 'mobile',
    } });
    assert.equal((await savedProviderLocation(own.user.id)).location_mode, 'mobile');
    assert.deepEqual(await savedProviderLocation(other.user.id), otherBefore);
    assert.equal(await savedProviderLocation(client.user.id), null);
  });

  test('registration reports every conflicting field across roles without changing the existing account or password', async () => {
    const username = identity();
    const email = `${username}@example.invalid`;
    const phone = '0503333333';
    const original = await register({ username, email, phone, role: 'provider' });
    const before = await db.queryOne('SELECT * FROM users WHERE id = ?', [original.user.id]);
    const countBefore = Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total);
    const replacementPassword = `RejectedReplacement-${crypto.randomBytes(8).toString('hex')}`;
    const duplicate = await registrationAttempt({
      username, email, phone, password: replacementPassword,
      full_name: 'اسم بديل لا ينبغي حفظه', role: 'client',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.result.success, false);
    assert.deepEqual(duplicate.result.errors.map(error => error.field), ['email', 'phone', 'username']);
    assert.ok(duplicate.result.errors.every(error => typeof error.message === 'string' && error.message.length > 0));
    assert.equal(duplicate.result.message, duplicate.result.errors[0].message);
    assert.equal(duplicate.result.data, undefined);

    const phoneOnly = await registrationAttempt({ phone, role: 'client' });
    assert.equal(phoneOnly.status, 409);
    assert.deepEqual(phoneOnly.result.errors.map(error => error.field), ['phone']);
    const after = await db.queryOne('SELECT * FROM users WHERE id = ?', [original.user.id]);
    assert.ok(JSON.stringify(after) === JSON.stringify(before), 'Duplicate signup must leave every original account field unchanged');
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total), countBefore);
    assert.equal(await comparePassword(password, after.password_hash), true);
    assert.equal(await comparePassword(replacementPassword, after.password_hash), false);
    assert.equal((await api('/auth/me', { token: original.token })).user.role, 'provider');
  });

  // AYK-027: phone, password, optional name and an automatic location.
  const simpleArea = async () => {
    const districts = await db.query('SELECT id, city_id FROM districts WHERE city_id = 9 AND is_active = 1 ORDER BY id LIMIT 3');
    return { city_id: 9, district_id: Number(districts[0].id), districts: districts.map(row => Number(row.id)) };
  };
  const simpleRegister = async (body, expected = 201) => {
    const response = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_version: 2, password: '1234', phone: phoneIdentity(), latitude: 24.7136, longitude: 46.6753, ...body }),
    });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  };

  test('simple client signup needs only phone, password and location; name and address are filled in', async () => {
    const area = await simpleArea();
    const session = await simpleRegister({ role: 'client', city_id: area.city_id, district_id: area.district_id });
    assert.match(session.user.full_name, /^مستخدم \d{4}$/);
    assert.equal(session.user.role, 'client');
    assert.ok(session.user.address && session.user.address.length >= 2);
    assert.equal(session.referral_code, undefined);
    const named = await simpleRegister({ role: 'client', full_name: 'سارة', city_id: area.city_id, district_id: area.district_id });
    assert.equal(named.user.full_name, 'سارة');
    await simpleRegister({ role: 'client', city_id: area.city_id, district_id: area.district_id, latitude: undefined, longitude: undefined }, 400);
    await simpleRegister({ role: 'client', full_name: 'س', city_id: area.city_id, district_id: area.district_id }, 400);
    await simpleRegister({ role: 'both', city_id: area.city_id, district_id: area.district_id }, 400);
  });

  test('simple provider and "both" signups take services from several professions and one city districts, and return the coupon', async () => {
    const area = await simpleArea();
    const services = await db.query(`SELECT DISTINCT ON (s.category_id) s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id
      WHERE s.is_active = 1 AND s.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL ORDER BY s.category_id, s.id LIMIT 2`);
    assert.equal(new Set(services.map(row => Number(row.category_id))).size, 2);
    const serviceIds = services.map(row => Number(row.id));
    const session = await simpleRegister({ role: 'both', city_id: area.city_id, district_id: area.district_id,
      service_ids: serviceIds, coverage_district_ids: area.districts.slice(0, 2), location_mode: 'mobile' });
    assert.equal(session.user.role, 'provider');
    assert.equal(Number(session.user.also_client), 1);
    assert.match(session.referral_code, /^[A-Z0-9]{4,12}$/);
    const profile = await db.queryOne('SELECT category_id, service_ids, coverage_city_id FROM provider_profiles WHERE user_id = ?', [session.user.id]);
    assert.deepEqual(profile.service_ids, serviceIds);
    assert.equal(Number(profile.category_id), Number(services[0].category_id));
    assert.equal(Number(profile.coverage_city_id), 9);
    const covered = await db.query('SELECT district_id FROM provider_coverage_districts WHERE user_id = ? ORDER BY district_id', [session.user.id]);
    assert.deepEqual(covered.map(row => Number(row.district_id)), area.districts.slice(0, 2));
    const me = await api('/auth/me', { token: session.token });
    assert.equal(me.provider.coverage_districts.length, 2);

    // A "both" account requests other services; a provider-only account cannot.
    const request = await api('/requests', { method: 'POST', token: session.token, expected: 201, body: {
      title: 'أحتاج كهربائي', description: 'تمديد كهرباء في المطبخ', city_id: area.city_id, district_id: area.district_id,
      latitude: 24.7136, longitude: 46.6753 } });
    assert.ok(request.id || request.request?.id);
    const providerOnly = await simpleRegister({ role: 'provider', city_id: area.city_id, district_id: area.district_id,
      service_ids: serviceIds.slice(0, 1), coverage_district_ids: area.districts.slice(0, 1) });
    assert.equal(Number(providerOnly.user.also_client), 0);
    await api('/requests', { method: 'POST', token: providerOnly.token, expected: 403, body: {
      title: 'طلب', description: 'وصف طلب تجريبي', city_id: area.city_id, district_id: area.district_id } });

    // "Matching me": a request outside the provider's professions is hidden; "All" still shows it.
    const requestId = Number(request.id || request.request?.id);
    const all = await api('/requests/nearby?limit=50', { token: providerOnly.token });
    assert.ok(all.some(row => Number(row.id) === requestId));
    const matching = await api('/requests/nearby?limit=50&matching=1', { token: providerOnly.token });
    assert.ok(!matching.some(row => Number(row.id) === requestId));
  });

  test('simple provider signup rejects missing services, missing coverage and districts of another city before creating an account', async () => {
    const area = await simpleArea();
    const service = await db.queryOne('SELECT id FROM services WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1');
    const otherCity = await db.queryOne('SELECT id FROM districts WHERE city_id <> 9 AND is_active = 1 ORDER BY id LIMIT 1');
    const account = { role: 'provider', city_id: area.city_id, district_id: area.district_id };
    const countBefore = Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total);
    for (const fields of [
      { coverage_district_ids: area.districts.slice(0, 1) },
      { service_ids: [], coverage_district_ids: area.districts.slice(0, 1) },
      { service_ids: [Number(service.id)] },
      { service_ids: [Number(service.id)], coverage_district_ids: [] },
      { service_ids: [Number(service.id)], coverage_district_ids: [Number(otherCity.id)] },
      { service_ids: [Number(service.id)], coverage_district_ids: ['x'] },
    ]) await simpleRegister({ ...account, ...fields }, 400);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM users')).total), countBefore);
  });

  // AYK-029: vacations, pause/resume, working days and hours, shown in search.
  test('provider availability is saved, validated, computed in Saudi time and shown in search', async () => {
    const { availability, localNow } = require('../utils/providerAvailability');
    const at = iso => new Date(iso);
    assert.equal(availability({ work_from: '08:00', work_to: '17:00' }, at('2026-10-28T15:30:00Z')).state, 'off_hours');
    assert.equal(availability({ work_from: '20:00', work_to: '02:00' }, at('2026-10-28T20:30:00Z')).state, 'available');
    assert.equal(availability({ work_days: '0,1' }, at('2026-10-28T10:00:00Z')).state, 'off_day');
    assert.equal(availability({ availability_status: 'paused', vacation_from: '2026-01-01', vacation_to: '2026-01-02' }).state, 'paused');

    const area = await simpleArea();
    const categories = await db.query(`SELECT DISTINCT ON (s.category_id) s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id
      WHERE s.is_active = 1 AND s.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL ORDER BY s.category_id, s.id LIMIT 2`);
    const session = await simpleRegister({ role: 'provider', city_id: area.city_id, district_id: area.district_id,
      service_ids: categories.map(row => Number(row.id)), coverage_district_ids: area.districts.slice(0, 1) });
    const update = (body, expected = 200) => api('/users/me/provider', { method: 'PUT', token: session.token, body, expected });
    const state = async () => (await api(`/users/${session.user.id}`)).provider.availability.state;
    const search = async (query = '') => (await api(`/providers/nearby?lat=24.7136&lon=46.6753&radius_km=5${query}`)).providers
      .find(row => Number(row.id) === Number(session.user.id));

    await update({ location_mode: 'fixed', fixed_latitude: 24.7136, fixed_longitude: 46.6753, show_location_on_map: 1 });
    assert.equal(await state(), 'available');
    // Search by the provider's SECOND profession still finds them.
    assert.ok(await search(`&category_id=${categories[1].category_id}`));

    await update({ availability_status: 'paused' });
    assert.equal(await state(), 'paused');
    assert.equal((await search()).availability.state, 'paused');
    assert.equal(await search('&available=1'), undefined);

    const today = localNow().date;
    const shift = days => new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    await update({ availability_status: 'active', vacation_from: shift(-1), vacation_to: shift(1) });
    const onVacation = (await api(`/users/${session.user.id}`)).provider.availability;
    assert.equal(onVacation.state, 'vacation');
    assert.equal(onVacation.until, shift(1));
    await update({ vacation_from: shift(-5), vacation_to: shift(-2) });
    assert.equal(await state(), 'available', 'a past vacation is ignored');

    await update({ work_days: [0, 1, 2, 3, 4, 5, 6], work_from: '08:00', work_to: '22:00' });
    const saved = await db.queryOne('SELECT work_days, work_from, work_to FROM provider_profiles WHERE user_id = ?', [session.user.id]);
    assert.deepEqual(saved, { work_days: null, work_from: '08:00', work_to: '22:00' });
    await update({ work_days: [5, 6, 5], work_from: '', work_to: '' });
    assert.deepEqual(await db.queryOne('SELECT work_days, work_from, work_to FROM provider_profiles WHERE user_id = ?', [session.user.id]),
      { work_days: '5,6', work_from: null, work_to: null });

    for (const body of [
      { availability_status: 'sleeping' }, { vacation_from: shift(2), vacation_to: shift(1) }, { vacation_from: '2026-13-01', vacation_to: '2026-13-02' },
      { vacation_from: shift(1) }, { work_from: '25:00', work_to: '10:00' }, { work_from: '09:00' }, { work_from: '09:00', work_to: '09:00' },
      { work_days: [7] }, { work_days: [] }, { work_days: 'sun' },
    ]) await update(body, 400);
  });

  // AYK-016: with an active SMS provider, sign-up and "forgot password" need a phone code.
  test('an active SMS provider requires a 4-digit code for simple sign-up and resets passwords by phone', async () => {
    const ApiIntegration = require('../models/ApiIntegration');
    const integration = await ApiIntegration.create({ type: 'sms', provider: 'taqnyat', label: 'test',
      credentials: { token: 'test-token', sender: 'AyKhidma' }, is_enabled: 1, is_primary: 1 });
    const sent = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url).startsWith('https://api.taqnyat.sa/')) {
        sent.push(JSON.parse(options.body));
        return new Response(JSON.stringify({ messageId: sent.length }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    const lastCode = () => /(\d{4})/.exec(sent.at(-1).body)[1];
    const wrongCode = () => (lastCode() === '0000' ? '1111' : '0000');
    const sendCode = (body, expected = 200) => api('/auth/phone-code', { method: 'POST', body, expected });
    try {
      const area = await simpleArea();
      const phone = phoneIdentity();
      const account = { role: 'client', phone, city_id: area.city_id, district_id: area.district_id };

      await simpleRegister(account, 400);
      const result = await sendCode({ phone, purpose: 'signup' });
      assert.equal(result.required, true);
      assert.equal(result.length, 4);
      assert.deepEqual(sent.at(-1).recipients, ['966' + phone.slice(1)]);
      await sendCode({ phone, purpose: 'signup' }, 429);
      await simpleRegister({ ...account, phone_code: wrongCode() }, 400);
      const session = await simpleRegister({ ...account, phone_code: lastCode() });
      const saved = await db.queryOne('SELECT is_verified, phone_verified_at FROM users WHERE id = ?', [session.user.id]);
      assert.equal(Number(saved.is_verified), 1);
      assert.ok(saved.phone_verified_at);
      await sendCode({ phone, purpose: 'signup' }, 409);

      await db.query('DELETE FROM auth_rate_limits');
      const before = sent.length;
      await sendCode({ phone: phoneIdentity(), purpose: 'reset' });
      assert.equal(sent.length, before, 'an unknown number gets no message but the same answer');
      await sendCode({ phone, purpose: 'reset' });
      const code = lastCode();
      await api('/auth/reset-password', { method: 'POST', body: { phone, code: wrongCode(), password: '9876' }, expected: 400 });
      await api('/auth/reset-password', { method: 'POST', body: { phone, code, password: '9876' } });
      await api('/auth/me', { token: session.token, expected: 401 });
      await api('/auth/login', { method: 'POST', body: { identifier: phone, password: '9876' } });
      await api('/auth/reset-password', { method: 'POST', body: { phone, code, password: '5555' }, expected: 400 });
    } finally {
      global.fetch = originalFetch;
      await db.query('DELETE FROM api_integrations WHERE id = ?', [integration.id]);
    }
    // Without a provider, sign-up needs no code and recovery says it is unavailable.
    await db.query('DELETE FROM auth_rate_limits');
    assert.deepEqual(await sendCode({ phone: phoneIdentity(), purpose: 'signup' }), { required: false });
    await sendCode({ phone: phoneIdentity(), purpose: 'reset' }, 503);
  });

  test('concurrent signups with one fresh username create exactly one account and return a field conflict to the loser', async () => {
    const username = identity();
    const attempts = [
      { username, full_name: 'الطلب المتزامن الأول', password: `FirstRace-${crypto.randomBytes(8).toString('hex')}`, role: 'client' },
      { username, full_name: 'الطلب المتزامن الثاني', password: `SecondRace-${crypto.randomBytes(8).toString('hex')}`, role: 'provider' },
    ];
    const responses = await Promise.all(attempts.map(registrationAttempt));
    assert.deepEqual(responses.map(response => response.status).sort((a, b) => a - b), [201, 409]);
    const winnerIndex = responses.findIndex(response => response.status === 201);
    const loserIndex = 1 - winnerIndex;
    const winner = responses[winnerIndex];
    const loser = responses[loserIndex];
    assert.equal(loser.result.success, false);
    assert.deepEqual(loser.result.errors.map(error => error.field), ['username']);
    assert.equal(loser.result.message, loser.result.errors[0].message);
    const rows = await db.query('SELECT id, full_name, role, password_hash FROM users WHERE username = ?', [username]);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].id), Number(winner.result.data.user.id));
    assert.equal(rows[0].full_name, attempts[winnerIndex].full_name);
    assert.equal(rows[0].role, attempts[winnerIndex].role);
    assert.equal(await comparePassword(attempts[winnerIndex].password, rows[0].password_hash), true);
    assert.equal(await comparePassword(attempts[loserIndex].password, rows[0].password_hash), false);
  });
}
