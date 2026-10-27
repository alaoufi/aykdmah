// Every run owns a new localhost database and deletes only that database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const databasePrefix = process.env.RYZA_ADS_TEST_DB;

if (!databasePrefix) {
  test('live advertisements integration (set RYZA_ADS_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ryza_test_ads[a-z0-9_]{0,20}$/.test(databasePrefix)) {
    throw new Error('Use a disposable ryza_test_ads* database prefix.');
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
  const Ad = require('../models/Ad');
  let server, base, createdDatabase = false;
  let legacy, multi, bottom, expired, capped;
  const maintenanceClient = () => new Client({
    host: '127.0.0.1', port, user: 'postgres', password: '',
    database: 'postgres', ssl: false, connectionTimeoutMillis: 15000,
  });
  async function live(placement) {
    const response = await fetch(`${base}/ads/live?placement=${encodeURIComponent(placement)}`);
    const result = await response.json();
    assert.equal(response.status, 200, result.message);
    return result.data;
  }
  const ids = rows => rows.map(row => Number(row.id)).sort((a, b) => a - b);
  const create = data => Ad.create({ title: 'Local advertisement test', status: 'active', is_active: true, ...data });

  test.before(async () => {
    const admin = maintenanceClient();
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      createdDatabase = true;
    } finally { await admin.end(); }
    const setup = await install.setupFromEnv();
    assert.equal(setup.migrations.flatMap(migration => migration.errors).length, 0);
    // Remove the welcome banner seeded in this newly owned test database.
    await db.query('DELETE FROM ads');
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

  test('all four homepage ad slots return an empty list successfully without advertisements', async () => {
    for (const placement of ['home_top', 'home_hero', 'home_middle', 'home_bottom']) {
      assert.deepEqual(await live(placement), []);
    }
  });

  test('live slots match legacy and JSONB placements exactly and preserve serving limits', async () => {
    legacy = await create({ placement: 'home_top' });
    multi = await create({ placement: 'sidebar', placements: ['home_hero', 'home_middle'] });
    bottom = await create({ placement: 'home_bottom' });
    await create({ placement: 'search', placements: ['home_top_extra', 'home_hero_extra'] });
    await create({ placement: 'home_top', is_active: false });
    await create({ placement: 'home_middle', starts_at: new Date(Date.now() + 86400000) });
    await create({ placement: 'sidebar', placements: ['home_hero'], status: 'paused' });
    expired = await create({ placement: 'home_bottom', ends_at: new Date(Date.now() - 86400000) });
    capped = await create({ placement: 'sidebar', placements: ['home_hero'], max_views: 1 });
    await db.query('UPDATE ads SET views_count = 1 WHERE id = ?', [capped.id]);

    for (const [placement, expected] of [
      ['home_top', [legacy.id]], ['home_hero', [multi.id]],
      ['home_middle', [multi.id]], ['home_bottom', [bottom.id]],
    ]) {
      assert.deepEqual(ids(await live(placement)), expected.map(Number));
    }
    assert.deepEqual((await Ad.findById(multi.id)).placements, ['home_hero', 'home_middle']);
    for (const item of [expired, capped]) {
      const swept = await Ad.findById(item.id);
      assert.equal(swept.status, 'expired');
      assert.equal(Number(swept.is_active), 0);
    }
  });

  test('administrative pagination applies the same exact JSONB placement membership', async () => {
    const filtered = await Ad.listPaginated({ placement: 'home_hero', status: 'active' });
    assert.deepEqual(ids(filtered.items), [Number(multi.id)]);
    assert.equal(Number(filtered.total), 1);
    const legacyOnly = await Ad.listPaginated({ placement: 'home_top', status: 'active' });
    assert.ok(legacyOnly.items.some(item => Number(item.id) === Number(legacy.id)));
    assert.ok(legacyOnly.items.every(item => item.placement === 'home_top'));
  });

  test('exclusive ads supersede shared ads only while the exclusive ad remains eligible', async () => {
    const exclusive = await create({ placement: 'home_bottom', exclusive: true });
    assert.deepEqual(ids(await live('home_bottom')), [Number(exclusive.id)]);
    await db.query('UPDATE ads SET ends_at = ? WHERE id = ?', [new Date(Date.now() - 86400000), exclusive.id]);
    assert.deepEqual(ids(await live('home_bottom')), [Number(bottom.id)]);
  });

  test('the additive advertising repair replays without changing ads or migration history', async () => {
    const migrationName = '032_restore_ad_workflow_columns.sql';
    const source = fs.readFileSync(path.join(__dirname, '../../database/migrations', migrationName), 'utf8');
    const mirror = fs.readFileSync(path.join(__dirname, '../../database/postgres/migrations', migrationName), 'utf8');
    assert.equal(source, mirror);
    const beforeAds = await db.query('SELECT * FROM ads ORDER BY id');
    const beforeJournal = await db.query('SELECT * FROM schema_migrations ORDER BY name');
    assert.ok(beforeJournal.some(row => row.name === migrationName));
    const connection = await db.getPool().connect();
    try {
      for (const statement of install.splitSql(source)) {
        await connection.query(install.mysqlToPg(statement));
      }
    } finally { connection.release(); }
    assert.deepEqual(await db.query('SELECT * FROM ads ORDER BY id'), beforeAds);
    assert.deepEqual(await db.query('SELECT * FROM schema_migrations ORDER BY name'), beforeJournal);
  });
}
