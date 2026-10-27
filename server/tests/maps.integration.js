// Maps: saved provider location round trip, opt-in map visibility, nearby search
// and address search validation. Uses only a unique, disposable localhost database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databasePrefix = process.env.RYZA_MAPS_TEST_DB;

if (!databasePrefix) {
  test('maps integration (set RYZA_MAPS_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ryza_test_maps[a-z0-9_]{0,20}$/.test(databasePrefix)) throw new Error('Use a disposable ryza_test_maps* database prefix.');
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
  const jwt = require('../utils/jwt');
  const nativeFetch = global.fetch;
  let server, base, createdDatabase = false, buraidah, users = {};

  const admin = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  async function api(route, { user, method = 'GET', body } = {}) {
    const response = await nativeFetch(base + route, {
      method,
      headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  async function provider(name, { cityId, categoryId, fixed, show, mode = 'fixed' }) {
    const row = await db.query('INSERT INTO users (full_name, email, password_hash, role, city_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [name, `${name}@test.invalid`, 'unused-local-test-hash', 'provider', cityId]);
    await db.query(`INSERT INTO provider_profiles (user_id, category_id, location_mode, fixed_latitude, fixed_longitude, show_location_on_map, service_radius_km)
      VALUES (?, ?, ?, ?, ?, ?, 25)`, [row.insertId, categoryId, mode, fixed?.[0] ?? null, fixed?.[1] ?? null, show ? 1 : 0]);
    return { id: row.insertId, token: jwt.sign({ id: row.insertId, role: 'provider', auth_version: 0 }) };
  }

  test.before(async () => {
    const client = admin();
    await client.connect();
    try { await client.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await client.end(); }
    const setup = await require('../services/installService').setupFromEnv();
    assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
    buraidah = await db.queryOne('SELECT * FROM cities WHERE id = 9');
    assert.ok(buraidah?.latitude != null, 'Buraidah seed coordinates are required');
    const category = await db.queryOne('SELECT id FROM categories ORDER BY id LIMIT 1');
    const other = await db.queryOne('SELECT id FROM categories WHERE id <> ? ORDER BY id LIMIT 1', [category.id]);
    const lat = Number(buraidah.latitude), lon = Number(buraidah.longitude);
    // ~5.5 km north of the city center, opted in to the map.
    users.visible = await provider('visible', { cityId: 9, categoryId: category.id, fixed: [lat + 0.05, lon], show: true });
    // Same private point, not opted in: must surface at the city center only.
    users.hidden = await provider('hidden', { cityId: 9, categoryId: category.id, fixed: [lat + 0.05, lon], show: false });
    users.otherCategory = await provider('othercat', { cityId: 9, categoryId: other.id, fixed: [lat, lon + 0.02], show: true });
    users.mobile = await provider('mobile', { cityId: 9, categoryId: category.id, fixed: [lat + 0.01, lon], show: true, mode: 'mobile' });
    users.categoryId = category.id;
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  test.after(async () => {
    global.fetch = nativeFetch;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const client = admin();
      await client.connect();
      await client.query(`DROP DATABASE "${databaseName}"`);
      await client.end();
    }
  });

  test('migration 041 adds the opt-in column defaulting to private', async () => {
    const column = await db.queryOne(`SELECT column_default FROM information_schema.columns
      WHERE table_name = 'provider_profiles' AND column_name = 'show_location_on_map'`);
    assert.ok(column, 'show_location_on_map exists');
    assert.match(String(column.column_default), /0/);
  });

  test('a saved provider location survives a reload from the database', async () => {
    const point = { fixed_latitude: 26.3591234, fixed_longitude: 43.9812345, show_location_on_map: 1, location_mode: 'fixed' };
    const saved = await api('/users/me/provider', { user: users.hidden, method: 'PUT', body: point });
    assert.equal(saved.status, 200, saved.body?.message);
    const reloaded = await api(`/users/${users.hidden.id}`, { user: users.hidden });
    assert.equal(Number(reloaded.body.data.provider.fixed_latitude), point.fixed_latitude);
    assert.equal(Number(reloaded.body.data.provider.fixed_longitude), point.fixed_longitude);
    assert.equal(Number(reloaded.body.data.provider.show_location_on_map), 1);
    // Restore the private setting used by the privacy tests.
    await api('/users/me/provider', { user: users.hidden, method: 'PUT', body: { show_location_on_map: 0, fixed_latitude: Number(buraidah.latitude) + 0.05, fixed_longitude: Number(buraidah.longitude) } });
  });

  test('public profile exposes coordinates only after opting in', async () => {
    const visible = await api(`/users/${users.visible.id}`);
    assert.equal(visible.status, 200);
    assert.ok(visible.body.data.provider.fixed_latitude != null);
    const hidden = await api(`/users/${users.hidden.id}`);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.provider.fixed_latitude, undefined);
    assert.equal(hidden.body.data.provider.fixed_longitude, undefined);
    const mobile = await api(`/users/${users.mobile.id}`);
    assert.equal(mobile.body.data.provider.fixed_latitude, undefined);
  });

  test('nearby providers: privacy, distance, ordering and filters', async () => {
    const lat = Number(buraidah.latitude), lon = Number(buraidah.longitude);
    const res = await api(`/providers/nearby?lat=${lat}&lon=${lon}&radius_km=25`);
    assert.equal(res.status, 200, res.body?.message);
    const byId = Object.fromEntries(res.body.data.providers.map(p => [p.id, p]));
    assert.equal(byId[users.visible.id].location_precision, 'exact');
    assert.ok(Math.abs(byId[users.visible.id].distance_km - 5.6) < 0.3, `distance ${byId[users.visible.id].distance_km}`);
    // Not opted in: city center and zero distance, never the private point.
    assert.equal(byId[users.hidden.id].location_precision, 'city');
    assert.equal(byId[users.hidden.id].latitude, lat);
    assert.equal(byId[users.hidden.id].distance_km, 0);
    assert.equal(byId[users.mobile.id].location_precision, 'city');
    const distances = res.body.data.providers.map(p => p.distance_km);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));

    const filtered = await api(`/providers/nearby?lat=${lat}&lon=${lon}&radius_km=25&category_id=${users.categoryId}`);
    assert.ok(!filtered.body.data.providers.some(p => p.id === users.otherCategory.id));
    const tight = await api(`/providers/nearby?lat=${lat}&lon=${lon}&radius_km=1`);
    assert.ok(!tight.body.data.providers.some(p => p.id === users.visible.id));
    assert.equal((await api('/providers/nearby?lat=999&lon=1')).status, 400);
  });

  test('address search validates input and never invents results', async () => {
    assert.equal((await api('/geo/search?q=ab')).status, 400);
    global.fetch = async () => ({ ok: true, json: async () => [] });
    const empty = await api('/geo/search?q=unknown-local-place');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data.results, []);
    global.fetch = async () => { throw new Error('offline'); };
    const offline = await api('/geo/search?q=another-unknown-place');
    assert.equal(offline.status, 503);
    global.fetch = nativeFetch;
  });
}
