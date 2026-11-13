// This suite owns a fresh localhost database and temporary upload directory.
// It never loads application credentials, sends messages, or touches live data.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const port = Number(process.env.AYK_TEST_PORT || 55432);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
const databaseName = `ayk_test_account_location_${crypto.randomBytes(10).toString('hex')}`;
const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aykdmh-account-location-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
  DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', DATABASE_URL: '', DIRECT_DATABASE_URL: '',
  DB_POOL_MAX: '1', JWT_SECRET: crypto.randomBytes(48).toString('hex'), AUTO_MIGRATE: 'false',
  APP_URL: 'http://127.0.0.1', CLIENT_URL: 'http://127.0.0.1', UPLOAD_DIR: uploadDirectory,
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '',
  WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', API_RATE_LIMIT: '10000',
});
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const install = require('../services/installService');
const User = require('../models/User');
const Request = require('../models/Request');
let server, base, maintenance, created = false;
const nativeFetch = global.fetch;
global.fetch = (...args) => {
  const destination = new URL(args[0]);
  assert.equal(destination.hostname, '127.0.0.1', 'Only this isolated local application may be contacted');
  assert.equal(destination.port, String(server.address().port));
  return nativeFetch(...args);
};

const password = 'Local-Account-Location-2026';
const identity = () => `home_${crypto.randomBytes(6).toString('hex')}`;
const phone = () => `05${crypto.randomInt(10000000, 99999999)}`;
async function api(route, { token, body, method = 'GET', expected = 200, language = 'en' } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Accept-Language': language },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${result.message}`);
  return result.data;
}
async function location(cityId = 9) {
  if (cityId === 88) {
    const majmaah = await db.queryOne("SELECT id FROM cities WHERE name_ar = 'المجمعة' AND is_active = 1 ORDER BY id LIMIT 1");
    assert.ok(majmaah, 'The seeded Majmaah city must exist');
    cityId = Number(majmaah.id);
  }
  const district = await db.queryOne('SELECT id FROM districts WHERE city_id = ? AND is_active = 1 ORDER BY id LIMIT 1', [cityId]);
  assert.ok(district, 'The selected test city must have an active district');
  return { city_id: cityId, district_id: district.id, address: `عنوان منزل خاص في المدينة ${cityId}`,
    latitude: cityId === 9 ? 26.35 : 25.906, longitude: cityId === 9 ? 43.97 : 45.35 };
}
async function register(body = {}) {
  const role = body.role || 'client';
  let profession = {};
  if (role === 'provider') {
    const service = await db.queryOne(`SELECT s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id
      WHERE c.is_active = 1 AND s.is_active = 1 AND c.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1`);
    profession = { category_id: service.category_id, service_ids: [service.id] };
  }
  return api('/auth/register', { method: 'POST', expected: 201, body: {
    full_name: 'اختبار حساب وموقع محفوظ', username: identity(), phone: phone(), password, role,
    onboarding_version: 1, location_confirmed: true, ...await location(), ...profession, ...body,
  } });
}
const createRequest = (token, body = {}, expected = 201) => api('/requests', {
  token, method: 'POST', expected, body: { title: 'طلب خدمة محلي جديد', description: 'تفاصيل طلب محلي للتحقق من العنوان والموقع المحفوظ', ...body },
});
const accountLocation = async id => {
  const user = await User.findById(id);
  return Object.fromEntries(['country_id', 'region_id', 'governorate_id', 'city_id', 'district_id', 'address', 'latitude', 'longitude'].map(key => [key, user[key]]));
};

test.before(async () => {
  maintenance = new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const setup = await install.setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await db.getPool().end();
  if (created) {
    assert.match(databaseName, /^ayk_test_account_location_[a-f0-9]{20}$/);
    await maintenance.query(`DROP DATABASE "${databaseName}"`);
  }
  if (maintenance) await maintenance.end();
  fs.rmSync(uploadDirectory, { recursive: true, force: true });
  global.fetch = nativeFetch;
});
test.beforeEach(async () => { await db.query('DELETE FROM auth_rate_limits'); });

test('complete signup saves each role’s private address and actual point through login and session refresh', async () => {
  for (const role of ['client', 'provider']) {
    const session = await register({ role, fixed_address: 'عنوان مقر عمل عام', location_mode: 'both' });
    for (const response of [session, await api('/auth/login', { method: 'POST', body: { identifier: session.user.phone, password } }),
      await api('/auth/me', { token: session.token })]) {
      assert.equal(response.user.address, session.user.address);
      assert.equal(Number(response.user.city_id), 9);
      assert.equal(Number(response.user.region_id), 4);
      assert.equal(Number(response.user.country_id), 1);
      assert.equal(Number(response.user.latitude), 26.35);
      assert.equal(Number(response.user.longitude), 43.97);
    }
    const profile = await db.queryOne('SELECT address FROM user_profiles WHERE user_id = ?', [session.user.id]);
    assert.equal(profile.address, session.user.address);
    const publicProfile = await api(`/users/${session.user.id}`);
    for (const field of ['address', 'latitude', 'longitude']) assert.equal(Object.hasOwn(publicProfile.user, field), false);
    if (role === 'provider') {
      assert.equal(publicProfile.provider.fixed_address, 'عنوان مقر عمل عام');
      const privateWork = await User.getProviderProfile(session.user.id);
      assert.equal(privateWork.fixed_latitude, null);
      assert.equal(privateWork.fixed_longitude, null);
      assert.equal(session.user.username, null);
    }
  }
});

test('new onboarding rejects missing confirmation or incomplete location without creating accounts', async () => {
  const home = await location();
  for (const changes of [
    { location_confirmed: false }, { phone: null }, { address: '' }, { address: {} },
    { city_id: null, district_id: null }, { district_id: null }, { latitude: null, longitude: null },
    { address: 'ع'.repeat(501) }, { region_id: 1 }, { city_id: 2147483648 },
  ]) {
    const username = identity();
    await api('/auth/register', { method: 'POST', expected: 400, body: {
      full_name: 'تسجيل كامل غير صالح', username, phone: phone(), password, role: 'client',
      onboarding_version: 1, location_confirmed: true, ...home, ...changes,
    } });
    assert.equal(await db.queryOne('SELECT id FROM users WHERE username = ?', [username]), null);
  }
});

test('disabled phone registration fails explicitly in all five languages without silently dropping the phone', async () => {
  const previous = await db.queryOne("SELECT setting_value FROM settings WHERE setting_key = 'auth_methods_enabled'");
  await db.query("UPDATE settings SET setting_value = 'username,email' WHERE setting_key = 'auth_methods_enabled'");
  try {
    for (const language of ['ar', 'en', 'ur', 'hi', 'bn']) {
      const username = identity();
      await api('/auth/register', { method: 'POST', expected: 400, language, body: {
        full_name: 'تسجيل بجوال معطل', username, phone: phone(), password, role: 'client',
        onboarding_version: 1, location_confirmed: true, ...await location(),
      } });
      assert.equal(await db.queryOne('SELECT id FROM users WHERE username = ?', [username]), null);
    }
  } finally { await db.query("UPDATE settings SET setting_value = ? WHERE setting_key = 'auth_methods_enabled'", [previous.setting_value]); }
});

test('requests default to saved location and their snapshots survive later profile edits', async () => {
  const session = await register();
  const home = await accountLocation(session.user.id);
  const request = await createRequest(session.token);
  for (const key of ['city_id', 'district_id', 'address', 'latitude', 'longitude']) assert.equal(request[key], home[key]);
  const next = await location(88);
  await api('/users/me', { token: session.token, method: 'PUT', body: { ...next, complete_profile: true, location_confirmed: true } });
  const snapshot = await api(`/requests/${request.id}`, { token: session.token });
  assert.equal(snapshot.address, home.address);
  assert.equal(Number(snapshot.city_id), 9);
  assert.equal(Number(snapshot.latitude), 26.35);
  const later = await createRequest(session.token);
  assert.equal(later.address, next.address);
  assert.equal(Number(later.city_id), next.city_id);
  const nearby = await api('/requests/nearby');
  const publicRow = nearby.find(row => row.id === request.id);
  assert.ok(publicRow);
  for (const key of ['address', 'latitude', 'longitude']) assert.equal(Object.hasOwn(publicRow, key), false);
});

test('one-off location overrides drop old point and address without changing the account defaults', async () => {
  const session = await register();
  const home = await accountLocation(session.user.id);
  const other = await location(88);
  const areaOnly = await createRequest(session.token, { city_id: other.city_id, district_id: other.district_id });
  assert.equal(Number(areaOnly.city_id), other.city_id);
  for (const key of ['latitude', 'longitude', 'address']) assert.equal(areaOnly[key], null);
  const streetOnly = await createRequest(session.token, { address: 'عنوان زيارة واحدة في نفس المدينة' });
  assert.equal(streetOnly.latitude, null);
  assert.equal(streetOnly.longitude, null);
  const explicit = await createRequest(session.token, { ...other, remember_location: false });
  assert.equal(explicit.address, other.address);
  assert.equal(Number(explicit.latitude), other.latitude);
  assert.deepEqual(await accountLocation(session.user.id), home);
});

test('explicit remember saves complete defaults atomically and later requests reuse them', async () => {
  const session = await register();
  const other = await location(88);
  const request = await createRequest(session.token, { ...other, remember_location: 'true' });
  assert.equal(request.address, other.address);
  const saved = await accountLocation(session.user.id);
  assert.equal(Number(saved.city_id), other.city_id);
  assert.equal(Number(saved.country_id), 1);
  assert.equal(Number(saved.region_id), 1);
  assert.equal(Number(saved.governorate_id), 5);
  assert.equal(saved.address, other.address);
  assert.equal(Number(saved.latitude), other.latitude);
  const later = await createRequest(session.token);
  assert.equal(later.address, other.address);
  assert.equal(Number(later.city_id), other.city_id);
});

test('failed or incomplete remembered requests leave both account and request rows unchanged', async () => {
  const session = await register();
  const before = await accountLocation(session.user.id);
  const count = Number((await db.queryOne('SELECT COUNT(*) AS total FROM requests WHERE client_id = ?', [session.user.id])).total);
  const other = await location(88);
  for (const body of [
    { city_id: other.city_id, district_id: other.district_id, address: other.address },
    { ...other, district_id: null }, { ...other, address: '' },
    { ...other, title: 'ط'.repeat(201) }, { ...other, service_id: 2147483647 }, { ...other, budget_min: 20, budget_max: 10 },
  ]) {
    await createRequest(session.token, { ...body, remember_location: true }, 422);
    assert.deepEqual(await accountLocation(session.user.id), before);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM requests WHERE client_id = ?', [session.user.id])).total), count);
  }
  // Force a failure after the request INSERT reaches its transaction, proving
  // that a database write failure cannot partially save a remembered location.
  await assert.rejects(Request.create({ client_id: session.user.id, title: 'طلب يفشل عند إرفاق ملف',
    description: 'تفاصيل طلب محلي كامل لاختبار تراجع المعاملة', ...other, remember_location: true,
    files: [{ file_url: null, file_name: 'bad.png', file_type: 'image/png', file_size: 1 }] }));
  assert.deepEqual(await accountLocation(session.user.id), before);
  assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM requests WHERE client_id = ?', [session.user.id])).total), count);
  await db.query(`CREATE FUNCTION aykdmh_test_profile_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.address = 'Rejected remembered address' THEN RAISE EXCEPTION 'Forced local profile write failure'; END IF;
      RETURN NEW;
    END $$`);
  await db.query(`CREATE TRIGGER aykdmh_test_profile_write_failure BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION aykdmh_test_profile_write_failure()`);
  try {
    await assert.rejects(Request.create({ client_id: session.user.id, title: 'طلب يفشل أثناء حفظ الافتراضي',
      description: 'تفاصيل طلب محلي كامل لاختبار تراجع العنوان والطلب معًا', ...other,
      address: 'Rejected remembered address', remember_location: true }));
    assert.deepEqual(await accountLocation(session.user.id), before);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS total FROM requests WHERE client_id = ?', [session.user.id])).total), count);
  } finally {
    await db.query('DROP TRIGGER aykdmh_test_profile_write_failure ON user_profiles');
    await db.query('DROP FUNCTION aykdmh_test_profile_write_failure()');
  }
});

test('complete profile updates cannot lose the address or point and explicit completion requires confirmation', async () => {
  const session = await register();
  const before = await accountLocation(session.user.id);
  const other = await location(88);
  for (const body of [
    { address: 'عنوان جديد دون تأكيد النقطة' }, { city_id: other.city_id, district_id: other.district_id },
    { latitude: null, longitude: null }, { ...other, complete_profile: true, location_confirmed: false },
  ]) {
    await api('/users/me', { token: session.token, method: 'PUT', expected: 400, body });
    assert.deepEqual(await accountLocation(session.user.id), before);
  }
  const saved = await api('/users/me', { token: session.token, method: 'PUT', body: {
    ...other, complete_profile: true, location_confirmed: true,
  } });
  assert.equal(saved.address, other.address);
  assert.equal(Number(saved.latitude), other.latitude);
  await api('/users/me', { token: session.token, method: 'PUT', body: { full_name: 'اسم بعد التعديل فقط' } });
  assert.equal((await api('/auth/me', { token: session.token })).user.address, other.address);
});

test('complete accounts retain valid contact details during direct profile edits without reconfirming an unchanged location', async () => {
  const session = await register();
  const before = await accountLocation(session.user.id);
  for (const phone of ['123', null]) {
    await api('/users/me', { token: session.token, method: 'PUT', expected: 400, body: { phone } });
    assert.equal((await api('/auth/me', { token: session.token })).user.phone, session.user.phone);
    assert.deepEqual(await accountLocation(session.user.id), before);
  }
  const replacement = phone();
  const changed = await api('/users/me', { token: session.token, method: 'PUT', body: {
    phone: `${replacement.slice(0, 3)} ${replacement.slice(3)}`,
  } });
  assert.equal(changed.phone, replacement);
  assert.deepEqual(await accountLocation(session.user.id), before);
  await api('/users/me', { token: session.token, method: 'PUT', body: { full_name: 'تعديل اسم دون إعادة اختيار الموقع' } });
  assert.deepEqual(await accountLocation(session.user.id), before);
});

test('legacy accounts remain editable without inventing a location and can explicitly complete their profile', async () => {
  const username = identity();
  const session = await api('/auth/register', { method: 'POST', expected: 201, body: {
    full_name: 'حساب قديم بدون موقع', username, phone: '123', password, role: 'client',
  } });
  const saved = await api('/users/me', { token: session.token, method: 'PUT', body: {
    full_name: 'تعديل اسم حساب قديم', country_id: null, region_id: null, governorate_id: null,
    city_id: null, district_id: null, address: '', latitude: null, longitude: null,
  } });
  assert.equal(saved.address, null);
  assert.equal(saved.latitude, null);
  assert.equal(saved.phone, '123', 'An unrelated legacy edit keeps its existing contact data');
  const request = await createRequest(session.token);
  assert.equal(request.address, null);
  assert.equal(request.latitude, null);
  const completed = await api('/users/me', { token: session.token, method: 'PUT', body: {
    ...await location(), phone: phone(), complete_profile: true, location_confirmed: true,
  } });
  assert.ok(completed.address);
  assert.equal(Number(completed.latitude), 26.35);
});

test('concurrent request snapshots complete with a single database pool connection', async () => {
  assert.equal(db.getPool().options.max, 1);
  const session = await register();
  const requests = await Promise.all([1, 2, 3].map(() => createRequest(session.token)));
  assert.equal(new Set(requests.map(request => request.id)).size, 3);
  for (const request of requests) assert.equal(request.address, session.user.address);
});
