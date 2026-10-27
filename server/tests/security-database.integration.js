// All database writes are confined to fresh, random disposable localhost databases.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prefix = `ayk_test_database_${crypto.randomBytes(6).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
  DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432',
  DB_USER: 'postgres', DB_PASSWORD: '', DB_NAME: prefix, AUTO_MIGRATE: 'false',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '',
  MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  GOOGLE_MAPS_API_KEY: '', PUSH_PRIVATE_KEY: '', PUSH_PUBLIC_KEY: '',
});
const { Client } = require('pg');
const install = require('../services/installService');
const env = require('../config/env');
const root = path.join(__dirname, '../..');
const options = { host: '127.0.0.1', port: Number(process.env.DB_PORT), user: 'postgres' };
const admin = new Client({ ...options, database: 'postgres' });
const client = new Client({ ...options, database: prefix });
const bootstrap = new Client({ ...options, database: prefix + '_bootstrap' });
let clientReady = false, bootstrapReady = false;
const created = [];
const migrations = fs.readdirSync(path.join(root, 'database/migrations')).filter(name => name.endsWith('.sql')).sort();
test.before(async () => {
  await admin.connect();
  for (const name of [prefix, prefix + '_bootstrap']) {
    await admin.query(`CREATE DATABASE "${name}"`); created.push(name);
  }
  const result = await install.setupFromEnv();
  assert.equal(result.migrations.flatMap(item => item.errors).length, 0);
  await client.connect(); clientReady = true;
  await bootstrap.connect(); bootstrapReady = true;
});
test.after(async () => {
  if (clientReady) await client.end();
  if (bootstrapReady) await bootstrap.end();
  for (const name of created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
});

test('fresh installer applies every migration and required workflow tables/constraints', async () => {
  assert.deepEqual((await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(row => row.name), migrations);
  assert.equal((await client.query("SELECT setting_value FROM settings WHERE setting_key='site_name'")).rows[0].setting_value, 'أي خدمة');
  assert.equal((await client.query('SELECT description FROM subscription_plans WHERE id=2')).rows[0].description, 'اشتراك العامل الشهري في أي خدمة');
  for (const table of ['conversation_archives','ad_media','uploaded_media','auth_rate_limits']) {
    assert.equal((await client.query('SELECT to_regclass($1) AS name', [table])).rows[0].name, table);
  }
  const blob = (await client.query("SELECT data_type FROM information_schema.columns WHERE table_name='ad_media' AND column_name='data'")).rows[0];
  assert.equal(blob.data_type, 'bytea');
  const dispute = (await client.query("SELECT pg_get_constraintdef(oid) AS value FROM pg_constraint WHERE conname='disputes_status_check'")).rows[0].value;
  for (const status of ['waiting_response','escalated','rejected']) assert.ok(dispute.includes(status));
  const placements = (await client.query("SELECT pg_get_constraintdef(oid) AS value FROM pg_constraint WHERE conname='ads_placement_check'")).rows[0].value;
  assert.ok(placements.includes('home_hero') && placements.includes('footer'));
  const serviceModes = (await client.query(`SELECT pg_get_constraintdef(c.oid) AS value
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='location_mode'
    WHERE c.conrelid='provider_profiles'::regclass AND c.contype='c' AND c.conkey=ARRAY[a.attnum]`)).rows;
  assert.equal(serviceModes.length, 1);
  for (const mode of ['fixed', 'mobile', 'both']) assert.ok(serviceModes[0].value.includes(`'${mode}'`));
  const modeColumn = (await client.query("SELECT column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_profiles' AND column_name='location_mode'")).rows[0];
  assert.match(modeColumn.column_default, /^'mobile'(?:::text)?$/);
  assert.equal(modeColumn.is_nullable, 'YES');
});
test('geography covers every dataset record and replay preserves existing IDs/activation', async () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(root, 'database/geography/qassim-majmaah.json')));
  assert.equal(dataset.cities.length, 18);
  let count = 0;
  for (const city of dataset.cities) {
    const rows = (await client.query(`SELECT * FROM cities WHERE name_ar=$1 AND region_id=$2 AND governorate_id IS NOT DISTINCT FROM $3`, [city.name_ar, city.region_id, city.governorate_id])).rows;
    assert.equal(rows.length, 1); count += city.districts.length;
    for (const district of city.districts) {
      const found = (await client.query("SELECT id FROM districts WHERE city_id=$1 AND regexp_replace(trim(name_ar), '^حي[[:space:]]+', '')=$2", [rows[0].id, district.name_ar])).rows;
      assert.equal(found.length, 1, city.name_ar + '/' + district.name_ar);
    }
  }
  assert.equal(count, 386);
  const before = (await client.query('SELECT id,city_id,name_ar,name_en,latitude,longitude,is_active FROM districts ORDER BY id')).rows;
  const target = before.find(row => row.is_active === 1 && row.city_id !== 1);
  assert.ok(target);
  await client.query('UPDATE districts SET is_active=0 WHERE id=$1', [target.id]);
  await client.query('SELECT setval(pg_get_serial_sequence(\'cities\',\'id\'), 90000, false)');
  await client.query('SELECT setval(pg_get_serial_sequence(\'districts\',\'id\'), 100000, false)');
  await client.query(fs.readFileSync(path.join(root, 'database/migrations/031_qassim_majmaah_districts.sql'), 'utf8'));
  const after = (await client.query('SELECT id,city_id,name_ar,name_en,latitude,longitude,is_active FROM districts ORDER BY id')).rows;
  assert.deepEqual(after, before.map(row => row.id === target.id ? { ...row, is_active: 0 } : row));
  assert.equal((await client.query('SELECT last_value FROM cities_id_seq')).rows[0].last_value, '90000');
  assert.equal((await client.query('SELECT last_value FROM districts_id_seq')).rows[0].last_value, '100000');
});
test('journaled rerun and recovered catalog/admin migrations preserve current choices', async () => {
  const id = (await client.query("INSERT INTO users(full_name,password_hash,role,is_super_admin,permissions) VALUES ('Local limited administrator','unused-test-hash','admin',0,'[\"dashboard.view\"]') RETURNING id")).rows[0].id;
  await client.query("UPDATE categories SET name_en='Chosen category', icon='custom',is_active=0,deleted_at=now() WHERE id=1");
  await client.query("UPDATE services SET name_ar='Chosen service',name_en='Chosen service',is_active=0,deleted_at=now() WHERE id=122");
  await client.query("UPDATE settings SET setting_value='Chosen site' WHERE setting_key='site_name'");
  await client.query('DELETE FROM schema_migrations WHERE name = ANY($1)', [['002_extend_categories_services.sql','009_reseed_catalog.sql','026_admin_permissions.sql']]);
  const run = await install.runMigrationsFromEnv();
  assert.equal(run.applied.flatMap(item => item.errors).length, 0);
  const row = (await client.query('SELECT is_super_admin,permissions FROM users WHERE id=$1', [id])).rows[0];
  assert.deepEqual(row, { is_super_admin: 0, permissions: ['dashboard.view'] });
  const category = (await client.query('SELECT name_en,icon,is_active,deleted_at FROM categories WHERE id=1')).rows[0];
  assert.equal(category.name_en, 'Chosen category'); assert.equal(category.icon, 'custom'); assert.equal(category.is_active, 0); assert.ok(category.deleted_at);
  const service = (await client.query('SELECT name_ar,name_en,is_active,deleted_at FROM services WHERE id=122')).rows[0];
  assert.equal(service.name_ar, 'Chosen service'); assert.equal(service.name_en, 'Chosen service'); assert.equal(service.is_active, 0); assert.ok(service.deleted_at);
  assert.equal((await client.query("SELECT setting_value FROM settings WHERE setting_key='site_name'")).rows[0].setting_value, 'Chosen site');
  assert.equal((await install.runMigrationsFromEnv()).applied.length, 0);
});
test('service mode upgrade preserves legacy profiles, accepts both, and replays without changing data', async () => {
  const migration = fs.readFileSync(path.join(root, 'database/migrations/038_provider_service_mode.sql'), 'utf8');
  const profiles = async () => (await client.query('SELECT to_jsonb(p) AS value FROM provider_profiles p ORDER BY id')).rows.map(row => row.value);
  const unrelatedChecks = async () => (await client.query(`SELECT conname,pg_get_constraintdef(oid) AS definition,convalidated
    FROM pg_constraint WHERE conrelid='provider_profiles'::regclass AND conname IN
      ('provider_business_name_present', 'provider_radius_with_mode') ORDER BY conname`)).rows;
  const rejectsCheck = async (sql, params, constraint) => {
    await client.query('SAVEPOINT service_mode_invalid_write');
    try {
      await assert.rejects(client.query(sql, params), error => error.code === '23514' && (!constraint || error.constraint === constraint));
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT service_mode_invalid_write');
      await client.query('RELEASE SAVEPOINT service_mode_invalid_write');
    }
  };
  await client.query('BEGIN');
  try {
    // Recreate a legacy schema with differently named checks, including two
    // independent restrictions on the old fixed/mobile choices.
    const currentModeChecks = (await client.query(`SELECT c.conname
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='location_mode'
      WHERE c.conrelid='provider_profiles'::regclass AND c.contype='c' AND c.conkey=ARRAY[a.attnum]`)).rows;
    for (const { conname } of currentModeChecks) {
      await client.query(`ALTER TABLE provider_profiles DROP CONSTRAINT "${conname.replaceAll('"', '""')}"`);
    }
    await client.query(`ALTER TABLE provider_profiles
      ALTER COLUMN location_mode SET DEFAULT 'fixed',
      ADD CONSTRAINT old_provider_site_choice CHECK (location_mode IN ('fixed','mobile')),
      ADD CONSTRAINT legacy_provider_visit_rule CHECK (location_mode IS NULL OR location_mode='fixed' OR location_mode='mobile'),
      ADD CONSTRAINT provider_business_name_present CHECK (business_name IS NULL OR length(business_name)>0),
      ADD CONSTRAINT provider_radius_with_mode CHECK (location_mode IS NULL OR service_radius_km>=0)`);
    const users = (await client.query(`INSERT INTO users(full_name,password_hash,role) VALUES
      ('Legacy fixed provider','synthetic-test-hash','provider'),
      ('Legacy mobile provider','synthetic-test-hash','provider'),
      ('Legacy unspecified provider','synthetic-test-hash','provider'),
      ('New default provider','synthetic-test-hash','provider'),
      ('New both provider','synthetic-test-hash','provider') RETURNING id`)).rows.map(row => row.id);
    for (const [index, mode] of ['fixed', 'mobile', null].entries()) {
      await client.query(`INSERT INTO provider_profiles
        (user_id,business_name,bio,experience_years,service_ids,service_radius_km,hourly_rate,gallery,
         location_mode,fixed_address,fixed_latitude,fixed_longitude,verification_status,rating_count,completed_orders,total_earnings)
        VALUES ($1,$2,$3,7,'[1,2]',42,83.50,'["existing-photo.jpg"]',$4,$5,24.1234567,46.7654321,'verified',9,12,1000.25)`,
      [users[index], `Existing business ${index}`, `Existing biography ${index}`, mode, `Existing work address ${index}`]);
    }
    const before = await profiles();
    const retainedChecks = await unrelatedChecks();
    assert.equal(retainedChecks.length, 2);
    await client.query(migration);
    assert.deepEqual(await profiles(), before);
    assert.deepEqual(await unrelatedChecks(), retainedChecks);
    assert.equal((await client.query(`SELECT COUNT(*)::int AS count FROM pg_constraint
      WHERE conrelid='provider_profiles'::regclass AND conname IN ('old_provider_site_choice','legacy_provider_visit_rule')`)).rows[0].count, 0);
    const defaultProfile = (await client.query('INSERT INTO provider_profiles(user_id) VALUES ($1) RETURNING location_mode', [users[3]])).rows[0];
    assert.equal(defaultProfile.location_mode, 'mobile');
    const bothProfile = (await client.query(`INSERT INTO provider_profiles(user_id,location_mode,fixed_address,fixed_latitude,fixed_longitude)
      VALUES ($1,'both','New work address',25.1234567,47.7654321) RETURNING location_mode,fixed_address`, [users[4]])).rows[0];
    assert.deepEqual(bothProfile, { location_mode: 'both', fixed_address: 'New work address' });
    await rejectsCheck("UPDATE provider_profiles SET location_mode='future_mode' WHERE user_id=$1", [users[4]]);
    await rejectsCheck("UPDATE provider_profiles SET business_name='' WHERE user_id=$1", [users[4]], 'provider_business_name_present');
    await rejectsCheck('UPDATE provider_profiles SET service_radius_km=-1 WHERE user_id=$1', [users[4]], 'provider_radius_with_mode');
    const upgraded = await profiles();
    await client.query(migration);
    assert.deepEqual(await profiles(), upgraded);
    assert.deepEqual(await unrelatedChecks(), retainedChecks);
    assert.equal((await client.query('SELECT column_default FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=\'provider_profiles\' AND column_name=\'location_mode\'')).rows[0].column_default, "'mobile'::text");
    await rejectsCheck("UPDATE provider_profiles SET location_mode='future_mode' WHERE user_id=$1", [users[4]]);
  } finally { await client.query('ROLLBACK'); }
});
test('required schema failure is not journaled and stops later migrations', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ayk-database-migration-'));
  const schema = env.PATHS.SCHEMA_SQL;
  try {
    fs.mkdirSync(path.join(directory, 'migrations'));
    fs.writeFileSync(path.join(directory, 'migrations/998_missing_required.sql'), 'SELECT * FROM ayk_missing_required_table;');
    fs.writeFileSync(path.join(directory, 'migrations/999_must_not_run.sql'), 'CREATE TABLE ayk_must_not_run(id INT);');
    env.PATHS.SCHEMA_SQL = path.join(directory, 'schema.sql');
    const result = await install.runMigrationsFromEnv();
    assert.equal(result.applied[0].errors[0].code, '42P01');
    assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE name LIKE '99%'")).rows[0].count, 0);
    assert.equal((await client.query("SELECT to_regclass('ayk_must_not_run') AS name")).rows[0].name, null);
  } finally {
    env.PATHS.SCHEMA_SQL = schema; fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('NOT VALID integrity rules reject new invalid permissions and references', async () => {
  for (const sql of [
    "INSERT INTO users(full_name,password_hash,permissions) VALUES ('Invalid permission','unused','{}')",
    "INSERT INTO users(full_name,password_hash,is_super_admin) VALUES ('Invalid flag','unused',2)",
    "INSERT INTO users(full_name,password_hash,auth_version) VALUES ('Invalid version','unused',-1)",
    "INSERT INTO users(full_name,password_hash,country_id) VALUES ('Invalid country','unused',999999)",
  ]) await assert.rejects(client.query(sql), error => ['23514','23503'].includes(error.code));
});
test('generated bootstrap commits all migrations and refuses existing data', async () => {
  const sql = fs.readFileSync(path.join(root, 'database/postgres/RUN-ME.sql'), 'utf8');
  await bootstrap.query(sql);
  assert.deepEqual((await bootstrap.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(row => row.name), migrations);
  assert.equal((await bootstrap.query("SELECT setting_value FROM settings WHERE setting_key='site_name'")).rows[0].setting_value, 'أي خدمة');
  assert.equal((await bootstrap.query('SELECT description FROM subscription_plans WHERE id=2')).rows[0].description, 'اشتراك العامل الشهري في أي خدمة');
  await bootstrap.query("INSERT INTO users(full_name,password_hash,role,is_super_admin,permissions) VALUES ('Protected local administrator','unused','admin',0,'[\"dashboard.view\"]')");
  await bootstrap.query("UPDATE settings SET setting_value='Preserved bootstrap site' WHERE setting_key='site_name'");
  await assert.rejects(bootstrap.query(sql), /requires a fresh database schema/);
  await bootstrap.query('ROLLBACK');
  assert.deepEqual((await bootstrap.query('SELECT is_super_admin,permissions FROM users')).rows, [{ is_super_admin: 0, permissions: ['dashboard.view'] }]);
  assert.equal((await bootstrap.query("SELECT setting_value FROM settings WHERE setting_key='site_name'")).rows[0].setting_value, 'Preserved bootstrap site');
  assert.equal((await bootstrap.query('SELECT COUNT(*)::int AS count FROM schema_migrations')).rows[0].count, migrations.length);
});

test('first legacy permission upgrade grants access only on column introduction', async () => {
  const name = prefix + '_legacy';
  await admin.query(`CREATE DATABASE "${name}"`); created.push(name);
  const legacy = new Client({ ...options, database: name });
  await legacy.connect();
  try {
    await legacy.query("CREATE TABLE users(id SERIAL PRIMARY KEY,role TEXT NOT NULL)");
    await legacy.query("INSERT INTO users(role) VALUES ('admin'),('client')");
    const migration = fs.readFileSync(path.join(root, 'database/migrations/026_admin_permissions.sql'), 'utf8');
    await legacy.query(migration);
    assert.deepEqual((await legacy.query('SELECT is_super_admin FROM users ORDER BY id')).rows.map(row => row.is_super_admin), [1,0]);
    await legacy.query("UPDATE users SET is_super_admin=0,permissions='[\"dashboard.view\"]' WHERE role='admin'");
    await legacy.query(migration);
    assert.equal((await legacy.query("SELECT is_super_admin FROM users WHERE role='admin'")).rows[0].is_super_admin, 0);
  } finally { await legacy.end(); }
});
test('bootstrap required failure rolls back application tables and its journal', async () => {
  const name = prefix + '_rollback';
  await admin.query(`CREATE DATABASE "${name}"`); created.push(name);
  const broken = new Client({ ...options, database: name });
  await broken.connect();
  try {
    const source = fs.readFileSync(path.join(root, 'database/postgres/RUN-ME.sql'), 'utf8');
    const sql = source.replace(/COMMIT;\s*$/, 'SELECT * FROM ayk_missing_required_table; COMMIT;');
    await assert.rejects(broken.query(sql), error => error.code === '42P01');
    await broken.query('ROLLBACK');
    assert.equal((await broken.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='public'")).rows[0].count, 0);
  } finally { await broken.end(); }
});

test('partial legacy schemas recover missing columns even when adjacent columns already exist', async () => {
  await client.query('ALTER TABLE messages DROP COLUMN longitude');
  await client.query('ALTER TABLE reviews DROP COLUMN criteria_ratings');
  await client.query('ALTER TABLE ads DROP COLUMN notes');
  const names = ['003_communication_system.sql','004_two_way_reviews.sql','016_user_ad_requests.sql'];
  await client.query('DELETE FROM schema_migrations WHERE name=ANY($1)', [names]);
  const result = await install.runMigrationsFromEnv();
  assert.equal(result.applied.flatMap(item => item.errors).length, 0);
  for (const [table, column] of [['messages','longitude'],['reviews','criteria_ratings'],['ads','notes']]) {
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_name=$1 AND column_name=$2', [table,column])).rows[0].count, 1);
  }
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations WHERE name=ANY($1)', [names])).rows[0].count, names.length);
});
test('new NOT VALID rules preserve historical invalid rows while enforcing future writes', async () => {
  await client.query('ALTER TABLE users DROP CONSTRAINT users_super_admin_boolean');
  const id = (await client.query("INSERT INTO users(full_name,password_hash,is_super_admin) VALUES ('Legacy invalid record','unused',2) RETURNING id")).rows[0].id;
  await client.query(fs.readFileSync(path.join(root, 'database/migrations/036_security_integrity.sql'), 'utf8'));
  assert.equal((await client.query('SELECT is_super_admin FROM users WHERE id=$1', [id])).rows[0].is_super_admin, 2);
  assert.equal((await client.query("SELECT convalidated FROM pg_constraint WHERE conname='users_super_admin_boolean'")).rows[0].convalidated, false);
  await assert.rejects(client.query("INSERT INTO users(full_name,password_hash,is_super_admin) VALUES ('New invalid record','unused',2)"), error => error.code === '23514');
});
