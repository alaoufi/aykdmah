// AYK-271: the admin "Reports" -> backups report. A local stand-in for R2 answers the two reads
// (list, get); the signing itself is checked against botocore in alaoufi/server-edge
// (backups-monitor/tests). Uses its own disposable database, like security-finance.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const databaseName = `ayk_test_reports_${crypto.randomBytes(10).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '10000',
  DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: process.env.AYK_TEST_PORT || '55432',
  DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false',
  BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', BOOTSTRAP_ADMIN_USERNAME: '',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  R2_BACKUPS_ENDPOINT: '', R2_BACKUPS_READ_KEY_ID: '', R2_BACKUPS_READ_SECRET: '',
});
require('dotenv').config = () => ({ parsed: {} });
const { Client } = require('pg');
const db = require('../config/database');
const install = require('../services/installService');
const backupReport = require('../services/backupReport');
const { sign } = require('../utils/jwt');

const objects = new Map([
  ['daily/aykdmh-20261118-031500.tar.enc', { body: crypto.randomBytes(150000), at: new Date(Date.now() - 2 * 3600e3) }],
  ['daily/aykdmh-20261117-031500.tar.enc', { body: crypto.randomBytes(1000), at: new Date(Date.now() - 26 * 3600e3) }],
  ['verified/aykdmh-20261118-031500.tar.enc.json', { body: Buffer.from('{}'), at: new Date(Date.now() - 3600e3) }],
  ['secrets.txt', { body: Buffer.from('not a backup'), at: new Date() }],
]);
let fake, server, base, createdDatabase = false, sequence = 0;
const users = {};
const maintenance = () => new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: 'postgres', ssl: false });
async function makeAdmin(superAdmin, permissions = []) {
  const r = await db.query('INSERT INTO users (full_name, username, password_hash, role, is_active, is_super_admin, permissions) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ['Reports fixture', `reports_${++sequence}_${crypto.randomBytes(3).toString('hex')}`, 'no-login-fixture', 'admin', superAdmin ? 1 : 0, JSON.stringify(permissions)]);
  return { id: r.insertId, token: sign({ id: r.insertId, role: 'admin', auth_version: 0, scope: 'admin' }) };
}
async function api(route, { user, body, method = 'GET', expected = 200 } = {}) {
  const res = await fetch(base + route, { method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  assert.equal(res.status, expected, `${route}: ${json.message || ''}`);
  return json.data;
}

test.before(async () => {
  fake = http.createServer((req, res) => {
    if (!/^AWS4-HMAC-SHA256 Credential=0123456789abcdef0123456789abcdef\//.test(req.headers.authorization || '')) { res.writeHead(403); return res.end('<Error><Code>AccessDenied</Code></Error>'); }
    const url = new URL(req.url, 'http://x');
    const [, bucket, ...rest] = url.pathname.split('/');
    if (bucket !== 'aykdmh-backups') { res.writeHead(404); return res.end(); }
    if (!rest.length || !rest.join('/')) {
      const prefix = url.searchParams.get('prefix') || '';
      const body = [...objects].filter(([k]) => k.startsWith(prefix)).map(([k, o]) => `<Contents><Key>${k}</Key><LastModified>${o.at.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`).join('');
      res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${body}</ListBucketResult>`);
    }
    const o = objects.get(decodeURIComponent(rest.join('/')));
    if (!o) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Length': o.body.length }); return res.end(o.body);
  }).listen(0);
  await new Promise(r => fake.once('listening', r));
  const admin = maintenance(); await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await admin.end(); }
  const setup = await install.setupFromEnv();
  assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
  users.owner = await makeAdmin(true);
  users.auditor = await makeAdmin(false, ['activity_logs.view']);
  users.other = await makeAdmin(false, ['ads.manage']);
  server = require('../app').listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) await new Promise(r => server.close(r));
  if (fake) await new Promise(r => fake.close(r));
  await db.getPool().end();
  if (createdDatabase) { const admin = maintenance(); await admin.connect(); try { await admin.query(`DROP DATABASE "${databaseName}"`); } finally { await admin.end(); } }
});

test('backups report: off without a key, then the backups, the restore test, and who may download', async () => {
  assert.deepEqual(await api('/admin/reports/backups', { user: users.auditor }), { configured: false, can_download: false });
  await api('/admin/reports/backups', { user: users.other, expected: 403 });
  await api('/admin/reports/backups', { expected: 401 });

  Object.assign(process.env, { R2_BACKUPS_ENDPOINT: `http://127.0.0.1:${fake.address().port}`, R2_BACKUPS_READ_KEY_ID: '0123456789abcdef0123456789abcdef', R2_BACKUPS_READ_SECRET: 'f'.repeat(64) });
  backupReport._internal.reset();
  const report = await api('/admin/reports/backups', { user: users.auditor });
  assert.equal(report.configured, true);
  assert.equal(report.healthy, true);
  assert.equal(report.count, 2);
  assert.equal(report.newest.name, 'aykdmh-20261118-031500.tar.enc');
  assert.ok(report.last_verified);
  assert.equal(report.can_download, false);
  assert.ok(!JSON.stringify(report).includes('f'.repeat(64)));
  assert.ok(report.backups.every(o => o.key.startsWith('daily/')));

  // Only the main administrator gets a link, only for a listed backup.
  await api('/admin/reports/backups/link', { user: users.auditor, method: 'POST', body: { key: report.backups[0].key }, expected: 403 });
  await api('/admin/reports/backups/link', { user: users.owner, method: 'POST', body: { key: 'secrets.txt' }, expected: 404 });
  await api('/admin/reports/backups/link', { user: users.owner, method: 'POST', body: { key: 'daily/../secrets.txt' }, expected: 404 });
  const { url } = await api('/admin/reports/backups/link', { user: users.owner, method: 'POST', body: { key: report.backups[0].key } });
  const file = await fetch(base.replace(/\/api$/, '') + url);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /aykdmh-20261118-031500\.tar\.enc/);
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(objects.get('daily/aykdmh-20261118-031500.tar.enc').body));

  // A changed, foreign or expired link is refused; so is one whose administrator lost the role.
  const token = new URL(url, 'http://x').searchParams.get('t');
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), k: 'secrets.txt' })).toString('base64url');
  assert.equal((await fetch(`${base}/report-files/backup?t=${forged}.${mac}`)).status, 403);
  assert.equal((await fetch(`${base}/report-files/backup?t=${backupReport.linkToken(report.backups[0].key, users.owner.id, Date.now() - 10 * 60e3)}`)).status, 403);
  assert.equal((await fetch(`${base}/report-files/backup?t=${backupReport.linkToken(report.backups[0].key, users.auditor.id)}`)).status, 404);
  await db.query('UPDATE users SET is_super_admin = 0 WHERE id = ?', [users.owner.id]);
  assert.equal((await fetch(base.replace(/\/api$/, '') + url)).status, 404);
  await db.query('UPDATE users SET is_super_admin = 1 WHERE id = ?', [users.owner.id]);

  // An old newest backup shows as late; a refused key as an error, without the key.
  objects.delete('daily/aykdmh-20261118-031500.tar.enc');
  backupReport._internal.reset();
  assert.equal((await api('/admin/reports/backups', { user: users.owner })).healthy, false);
  process.env.R2_BACKUPS_READ_KEY_ID = 'ffffffffffffffffffffffffffffffff';
  backupReport._internal.reset();
  assert.equal((await api('/admin/reports/backups', { user: users.owner })).error, 'access_denied');
});
