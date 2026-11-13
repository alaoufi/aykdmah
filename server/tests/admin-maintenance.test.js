const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('admin conversation list remains valid through the PostgreSQL compatibility layer', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
  const sql = controller.slice(controller.indexOf('const listConversationsAdmin'), controller.indexOf('const getConversationAdmin'));
  const adapter = fs.readFileSync(path.join(__dirname, '../config/database.js'), 'utf8');
  const source = adapter.slice(adapter.indexOf('function translateMysqlFunctions'), adapter.indexOf('function translateSql'));
  const translate = vm.runInNewContext(`${source}; translateMysqlFunctions`);
  assert.doesNotMatch(translate(sql), /\bSEPARATOR\b/i, 'nested MySQL aggregates are not supported by the PostgreSQL translator');
});

test('district cleanup removes only a separate terminal English Dist or Dist. token', () => {
  const { normalizeDistrictEnglishName } = require('../utils/districtName');
  for (const name of ['Aljawhara Dist.', 'Aljawhara DIST', ' Aljawhara dist.  ']) assert.equal(normalizeDistrictEnglishName(name), 'Aljawhara');
  for (const name of ['District', 'Distillery', 'Al Dist Garden', 'AlDist', 'حي Dist']) {
    assert.equal(normalizeDistrictEnglishName(name), name === 'حي Dist' ? 'حي' : name);
  }
  assert.equal(normalizeDistrictEnglishName('Dist.'), 'Dist.', 'never erase the whole name');
  assert.equal(normalizeDistrictEnglishName(null), null);
});

test('catalog normalization confines cleanup to district English names', () => {
  const { normalizeCatalog } = require('../utils/catalogValidation');
  assert.equal(normalizeCatalog('district', { name_ar: 'حي Dist.', name_en: 'Garden Dist.' }).name_en, 'Garden');
  assert.equal(normalizeCatalog('district', { name_ar: 'حي Dist.' }).name_ar, 'حي Dist.');
  assert.equal(normalizeCatalog('city', { name_en: 'Garden Dist.' }).name_en, 'Garden Dist.');
  assert.equal(normalizeCatalog('region', { name_en: 'Garden Dist.' }).name_en, 'Garden Dist.');
});

test('generated suffix migration preserves regex dollar anchors without duplicating the bootstrap trailer', () => {
  const bootstrap = fs.readFileSync(path.join(__dirname, '../../database/postgres/RUN-ME.sql'), 'utf8');
  assert.equal((bootstrap.match(/CREATE OR REPLACE FUNCTION set_updated_at/g) || []).length, 1);
  const generated = fs.readFileSync(path.join(__dirname, '../../database/postgres/migrations/070_district_english_suffix.sql'), 'utf8');
  const body = generated.slice(generated.indexOf('CREATE TABLE')).trim();
  assert.ok(bootstrap.includes(body), 'the migration body is copied literally into RUN-ME.sql');
});

test('070 is authored in MySQL 8 and only its journal-specific SQL is translated for PostgreSQL', () => {
  const { mysqlToPg, splitSql } = require('../services/installService');
  const source = fs.readFileSync(path.join(__dirname, '../../database/migrations/070_district_english_suffix.sql'), 'utf8');
  const statements = splitSql(source).join('\n');
  assert.match(statements, /INSERT IGNORE INTO district_name_cleanup_070/);
  assert.match(statements, /name_en REGEXP /);
  assert.match(statements, /UPDATE districts d\s+JOIN district_name_cleanup_070 b/);
  assert.doesNotMatch(statements, /\bbtrim\s*\(|\bON CONFLICT\b|\s~\s/i);
  const pg = mysqlToPg(source);
  assert.match(pg, /ON CONFLICT \(district_id\) DO NOTHING/);
  assert.match(pg, /name_en ~ /);
  assert.match(pg, /UPDATE districts AS d SET name_en = b.new_name_en\s+FROM district_name_cleanup_070 b/);
  assert.doesNotMatch(splitSql(pg).join('\n'), /\bINSERT IGNORE\b|\bREGEXP\b|\bUPDATE districts d\s+JOIN/i);
  const unrelated = 'UPDATE districts d JOIN other_journal b ON d.id = b.id SET d.name_en = b.new_name_en';
  assert.equal(mysqlToPg(unrelated), unrelated, 'no broad UPDATE JOIN rewriting of older migrations');
});
