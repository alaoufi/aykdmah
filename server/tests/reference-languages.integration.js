// Own a fresh localhost database; never read credentials or alter an existing
// application's catalog while checking the native-name backfill.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const port = Number(process.env.RYZA_TEST_PORT || 5432);
if (![5432, 55432].includes(port)) throw new Error('Use the dedicated localhost test PostgreSQL port.');
const databaseName = `ryza_test_reference_${crypto.randomBytes(8).toString('hex')}`;
const connection = database => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database, ssl: false });
const root = path.resolve(__dirname, '../..');
const seed = fs.readFileSync(path.join(root, 'database/migrations/009_reseed_catalog.sql'), 'utf8');
const baseSeed = fs.readFileSync(path.join(root, 'database/seed.sql'), 'utf8');
// Exercise the base catalog before repair009, matching installation order.
// This preserves the earlier extension rows that repair009 intentionally omits.
const originalCatalog = [...baseSeed.matchAll(/INSERT IGNORE INTO (?:categories|services)\b[\s\S]*?;/gu)]
  .map(([statement]) => statement.replace('INSERT IGNORE INTO', 'INSERT INTO').replace(/;$/u, ' ON CONFLICT DO NOTHING;'));
const migration = fs.readFileSync(path.join(root, 'database/migrations/040_catalog_language_names.sql'), 'utf8');
const references = JSON.parse(fs.readFileSync(path.join(root, 'client/src/data/referenceNames.json'), 'utf8'));
let db, owned = false;
const snapshot = async () => {
  const result = {};
  for (const table of ['categories', 'services']) {
    result[table] = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return result;
};
const withoutTranslations = rows => rows.map(({ name_translations, ...row }) => row);

test.before(async () => {
  const maintenance = connection('postgres');
  await maintenance.connect();
  try {
    await maintenance.query(`CREATE DATABASE "${databaseName}"`);
    owned = true;
  } finally { await maintenance.end(); }
  db = connection(databaseName);
  await db.connect();
  await db.query(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY, name_ar TEXT, name_en TEXT, slug TEXT UNIQUE,
      icon TEXT, color TEXT, sort_order INTEGER, is_active INTEGER DEFAULT 1,
      name_translations JSONB
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id),
      name_ar TEXT, name_en TEXT, slug TEXT UNIQUE, sort_order INTEGER,
      is_active INTEGER DEFAULT 1, name_translations JSONB
    );
  `);
  for (const statement of originalCatalog) await db.query(statement);
  await db.query(seed);
  await db.query(`INSERT INTO services (id, category_id, name_ar, name_en, slug, sort_order, is_active)
    VALUES (3001, 2, 'غسيل الأحواش', 'Yard cleaning', 'ryza-yard-cleaning', 4, 1)`);
});

test.after(async () => {
  if (db) await db.end();
  if (owned) {
    const maintenance = connection('postgres');
    await maintenance.connect();
    try { await maintenance.query(`DROP DATABASE "${databaseName}"`); }
    finally { await maintenance.end(); }
  }
});

test('all seeded catalog labels gain native Urdu, Hindi and Bengali without changing catalog metadata', async () => {
  const before = await snapshot();
  await db.query(migration);
  const after = await snapshot();
  for (const table of ['categories', 'services']) {
    assert.deepEqual(withoutTranslations(after[table]), withoutTranslations(before[table]));
    for (const row of after[table]) {
      const reference = references.catalog.find(label => label.slug === row.slug && label.ar === row.name_ar && label.en === row.name_en);
      assert.ok(reference, `Missing canonical reference for ${row.slug}`);
      for (const lang of ['ur', 'hi', 'bn']) assert.equal(row.name_translations[lang], reference[lang], `${row.slug}:${lang}`);
    }
  }
  assert.equal(after.categories.length + after.services.length, 138);
});

test('the backfill keeps administrator translations and fills only missing native labels', async () => {
  await db.query(`UPDATE categories SET name_translations = $1 WHERE id = 1`, [
    JSON.stringify({ ar: 'صيانة منزلية', en: 'Home maintenance', ur: 'منتظم کا مخصوص نام', hi: '  ', bn: null, fr: 'Entretien personnalisé' }),
  ]);
  await db.query(migration);
  const row = (await db.query('SELECT name_translations FROM categories WHERE id = 1')).rows[0];
  assert.equal(row.name_translations.ur, 'منتظم کا مخصوص نام');
  assert.equal(row.name_translations.fr, 'Entretien personnalisé');
  const reference = references.catalog.find(label => label.slug === 'home-maintenance');
  assert.equal(row.name_translations.hi, reference.hi);
  assert.equal(row.name_translations.bn, reference.bn);
});

test('custom names, JSON name overrides and malformed legacy translation objects are preserved', async () => {
  await db.query(`UPDATE categories SET name_translations = '{"ar":"قسم مخصص","en":"Cleaning"}'::jsonb WHERE id = 2`);
  await db.query(`UPDATE categories SET name_en = 'Administrator moving service', name_translations = NULL WHERE id = 3`);
  await db.query(`UPDATE categories SET name_translations = '["legacy custom translation"]'::jsonb WHERE id = 4`);
  await db.query(`UPDATE categories SET name_translations = 'null'::jsonb WHERE id = 5`);
  await db.query(`UPDATE categories SET is_active = 0, sort_order = 999 WHERE id = 6`);
  await db.query(`UPDATE services SET category_id = 5, is_active = 0, sort_order = 888 WHERE id = 4`);
  const before = await snapshot();
  await db.query(migration);
  const after = await snapshot();
  for (const id of [2, 3, 4, 5]) {
    assert.deepEqual(after.categories.find(row => row.id === id), before.categories.find(row => row.id === id));
  }
  for (const table of ['categories', 'services']) {
    assert.deepEqual(withoutTranslations(after[table]), withoutTranslations(before[table]));
  }
});

test('rerunning the repair and seed preserves the catalog and completed translations', async () => {
  const before = await snapshot();
  for (const statement of originalCatalog) await db.query(statement);
  await db.query(seed);
  await db.query(migration);
  await db.query(migration);
  assert.deepEqual(await snapshot(), before);
});

test('every original catalog row in the base seed and extension/repair/launch migrations has a native reference', () => {
  const sourcePaths = [
    'database/seed.sql',
    'database/migrations/002_extend_categories_services.sql',
    'database/migrations/009_reseed_catalog.sql',
    'database/migrations/030_ryza_launch.sql',
  ];
  const keys = new Set(references.catalog.map(label => JSON.stringify([label.kind, label.slug, label.ar, label.en])));
  const sqlString = "'((?:[^']|'')*)'";
  const categoryPattern = new RegExp('\\(\\s*\\d+\\s*,\\s*' + sqlString + '\\s*,\\s*' + sqlString + '\\s*,\\s*' + sqlString + '\\s*,', 'gu');
  const servicePattern = new RegExp('\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*' + sqlString + '\\s*,\\s*' + sqlString + '\\s*,\\s*' + sqlString + '\\s*,', 'gu');
  for (const sourcePath of sourcePaths) {
    const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    for (const [statement] of source.matchAll(/INSERT(?: IGNORE)? INTO (?:categories|services)\b[\s\S]*?;/gu)) {
      const kind = /^INSERT(?: IGNORE)? INTO categories\b/u.test(statement) ? 'category' : 'service';
      const pattern = kind === 'category' ? categoryPattern : servicePattern;
      for (const match of statement.matchAll(pattern)) {
        const [ar, en, slug] = match.slice(1).map(value => value.replaceAll("''", "'"));
        assert.ok(keys.has(JSON.stringify([kind, slug, ar, en])), `Missing ${sourcePath}: ${slug}`);
      }
    }
  }
});

test('all imported launch districts have native labels and no mixed-script translation typos', () => {
  const geographySource = fs.readFileSync(path.join(root, 'database/migrations/031_qassim_majmaah_districts.sql'), 'utf8');
  const districtImport = geographySource.split('INSERT INTO ryza_district_name_import')[1].split('INSERT INTO districts')[0];
  const names = new Map(references.geography.map(label => [JSON.stringify([label.ar, label.en]), label]));
  assert.equal(names.size, references.geography.length, 'Canonical geography aliases must be unambiguous');
  let importedRows = 0;
  for (const match of districtImport.matchAll(/\(\d+, '((?:[^']|'')*)', '((?:[^']|'')*)'\)/gu)) {
    const ar = match[1].replaceAll("''", "'");
    const en = match[2].replaceAll("''", "'");
    assert.ok(names.has(JSON.stringify([ar, en])), `Missing launch district ${ar} / ${en}`);
    importedRows++;
  }
  assert.equal(importedRows, 386);
  for (const rows of Object.values(references)) {
    for (const row of rows) {
      assert.match(row.ur, /[\u0600-\u06ff]/u, `${row.ar}: Urdu text missing`);
      assert.match(row.hi, /[\u0900-\u097f]/u, `${row.ar}: Hindi text missing`);
      assert.match(row.bn, /[\u0980-\u09ff]/u, `${row.ar}: Bengali text missing`);
      assert.doesNotMatch(row.ur, /[\u0900-\u09ff]/u, `${row.ar}: mixed Urdu script`);
      assert.doesNotMatch(row.hi, /[\u0980-\u09ff\u0600-\u06ff]/u, `${row.ar}: mixed Hindi script`);
      assert.doesNotMatch(row.bn, /[\u0900-\u097f\u0600-\u06ff]/u, `${row.ar}: mixed Bengali script`);
    }
  }
});
