// AYK-343: what the administration adds is translated into the 11 languages.
// This suite owns one new database on the local PostgreSQL service; the translator is replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const databaseName = `ayk_test_ctr_${crypto.randomBytes(10).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '10000',
  DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432',
  DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false',
  PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_USERNAME: '',
  RESET_KEY: '', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '',
  WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
  PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
});
// Older revisions of env.js also remain isolated from credential files.
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const install = require('../services/installService');
const Ad = require('../models/Ad');
const { sign } = require('../utils/jwt');
let createdDatabase = false, server, base, sequence = 0;
const users = {};
const maintenance = () => new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 });
async function makeUser(role = 'provider', permissions = []) {
  const username = `ctr_${++sequence}_${crypto.randomBytes(4).toString('hex')}`;
  const result = await db.query('INSERT INTO users (full_name, username, password_hash, role, is_active, permissions) VALUES (?, ?, ?, ?, 1, ?)', ['Local translation fixture', username, 'no-login-fixture', role, JSON.stringify(permissions)]);
  const user = { id: result.insertId, role, permissions, token: sign({ id: result.insertId, role, auth_version: 0 }) };
  if (role === 'provider') await db.query('INSERT INTO provider_profiles (user_id) VALUES (?)', [user.id]);
  return user;
}
async function api(route, { user, body, method = 'GET', expected = 200 } = {}) {
  const response = await fetch(base + route, {
    method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${route}: ${result.message || JSON.stringify(result)}`);
  return result.data;
}

const translator = require('../services/translationService');
const contentTranslation = require('../services/contentTranslation');
const LANGS = contentTranslation.LANGS;
// A pretend translator: «<lang>:<text>», failing for the languages in `failing`.
let failing = new Set();
let calls = 0;
const realTranslate = translator.translate;
test.beforeEach(() => {
  failing = new Set(); calls = 0;
  translator.translate = async (text, from, to) => {
    calls += 1;
    if (failing.has(to)) throw new Error('translator down');
    return { text: `${to}:${text}`, provider: 'test' };
  };
});
test.afterEach(() => { translator.translate = realTranslate; });
const translations = async (table, id, column = 'name_translations') => {
  const row = await db.queryOne(`SELECT ${column} AS t FROM ${table} WHERE id = ?`, [id]);
  return typeof row.t === 'string' ? JSON.parse(row.t) : row.t;
};

test('a new district is translated into the 11 languages; a failed language is left out and filled later', async () => {
  const city = await db.queryOne('SELECT id FROM cities ORDER BY id LIMIT 1');
  failing = new Set(['tr']);
  const district = await api('/districts', { user: users.admin, method: 'POST', expected: 201, body: { city_id: city.id, name_ar: 'حي التجربة الجديد' } });
  await contentTranslation.translateRow('districts', district.id);
  let map = await translations('districts', district.id);
  assert.equal(map.ar, 'حي التجربة الجديد');
  assert.equal(map.en, 'en:حي التجربة الجديد');
  assert.equal(map.tr, undefined, 'a failed language is not filled with the Arabic name');
  assert.equal(contentTranslation.complete(map), false);
  failing = new Set();
  await contentTranslation.sweep({ limit: 100000 }); // the seeded professions come first
  map = await translations('districts', district.id);
  assert.equal(map.tr, 'tr:حي التجربة الجديد');
  for (const lang of LANGS) assert.ok(map[lang], `${lang} present`);
  const listed = await api(`/districts?city_id=${city.id}`);
  const row = (Array.isArray(listed) ? listed : listed.items || []).find(item => item.id === district.id);
  assert.ok(row, 'the district is listed');
  assert.equal((typeof row.name_translations === 'string' ? JSON.parse(row.name_translations) : row.name_translations).ur, 'ur:حي التجربة الجديد');
});

test('renaming replaces the old translations; a seeded place with no translations is left alone by the sweep', async () => {
  const city = await db.queryOne('SELECT id FROM cities ORDER BY id LIMIT 1');
  const district = await api('/districts', { user: users.admin, method: 'POST', expected: 201, body: { city_id: city.id, name_ar: 'حي قديم' } });
  await contentTranslation.translateRow('districts', district.id);
  await api(`/districts/${district.id}`, { user: users.admin, method: 'PUT', body: { name_ar: 'حي جديد' } });
  await contentTranslation.translateRow('districts', district.id);
  const map = await translations('districts', district.id);
  assert.equal(map.ar, 'حي جديد');
  assert.equal(map.en, 'en:حي جديد');
  const seeded = await db.queryOne('SELECT id FROM districts WHERE name_translations IS NULL ORDER BY id LIMIT 1');
  if (seeded) {
    calls = 0;
    await contentTranslation.sweep({ limit: 100000 });
    assert.equal((await db.queryOne('SELECT name_translations AS t FROM districts WHERE id = ?', [seeded.id])).t, null);
  }
});

test('a new profession keeps no Arabic text in place of a failed translation', async () => {
  failing = new Set(['ml']);
  const category = await api('/categories', { user: users.admin, method: 'POST', expected: 201, body: { name_ar: 'مهنة تجريبية' } });
  const map = await translations('categories', category.id);
  assert.equal(map.en, 'en:مهنة تجريبية');
  assert.notEqual(map.ml, 'مهنة تجريبية');
  failing = new Set();
  await contentTranslation.translateRow('categories', category.id);
  assert.equal((await translations('categories', category.id)).ml, 'ml:مهنة تجريبية');
});

test('an ad written in English is translated from English, and the live ads carry the translations', async () => {
  const ad = await Ad.create({ title: 'Fresh bread every morning', description: 'Order now', placement: 'services_top', status: 'active', is_active: true });
  await contentTranslation.translateRow('ads', ad.id);
  const map = await translations('ads', ad.id, 'title_translations');
  assert.equal(map.en, 'Fresh bread every morning');
  assert.equal(map.ar, 'ar:Fresh bread every morning');
  const live = await api('/ads/live?placement=services_top');
  const row = live.find(item => item.id === ad.id);
  assert.equal(row.title_translations.ur, 'ur:Fresh bread every morning');
  assert.equal(row.description_translations.ar, 'ar:Order now');
});
test.before(async () => {
  const admin = maintenance();
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; }
  finally { await admin.end(); }
  const setup = await install.setupFromEnv();
  assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
  await db.query('DELETE FROM ads');
  users.admin = await makeUser('admin');
  await db.query("UPDATE users SET is_super_admin = 1 WHERE id = ?", [users.admin.id]);
  server = require('../app').listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.getPool().end();
  if (createdDatabase) {
    assert.match(databaseName, /^ayk_test_ctr_[a-f0-9]{20}$/);
    const admin = maintenance();
    await admin.connect();
    try { await admin.query(`DROP DATABASE "${databaseName}"`); }
    finally { await admin.end(); }
  }
});
