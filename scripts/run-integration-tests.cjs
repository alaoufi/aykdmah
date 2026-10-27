#!/usr/bin/env node
// Reconstructed from the recovered test contracts, not the missing original.
// Only newly owned databases on an explicitly selected localhost test instance.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.AYK_TEST_PORT);
const host = process.env.AYK_TEST_HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || ![5432, 55432].includes(port)) {
  console.error('Use an explicitly selected, dedicated LOCAL test PostgreSQL instance: AYK_TEST_PORT=55432 npm run test:integration. Remote databases are refused.');
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ readOnlyPreflight: true, databaseHost: '127.0.0.1', port, credentialsInherited: false, ownedDatabasesOnly: true }));
  process.exit(0);
}
const { Client } = createRequire(path.join(root, 'server/package.json'))('pg');
const suffix = crypto.randomBytes(10).toString('hex');
const names = ['marketplace', 'media', 'location'].map(scope => `ayk_test_${scope}_${suffix}`);
const owned = [];
const maintenance = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
let child;
let interrupted = false;
let exitCode = 1;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; child?.kill(signal); });
async function main() {
  const admin = maintenance();
  await admin.connect();
  try {
    // The client destination is always loopback. A dedicated Docker test
    // server may report its private container address from inet_server_addr().
    for (const name of names) {
      if (interrupted) throw new Error('Verification interrupted.');
      await admin.query(`CREATE DATABASE "${name}"`);
      owned.push(name);
    }
  } finally { await admin.end(); }
  const env = { ...process.env };
  // Clear inherited application destinations and credentials before dotenv runs.
  for (const key of Object.keys(env)) if (/DATABASE|^DB_|^PG|^MAIL_|^PAYMENT_|^WHATSAPP_|^NAFATH_|^PUSH_|BOOTSTRAP|^GOOGLE_/.test(key)) env[key] = '';
  Object.assign(env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false',
    DATABASE_URL: '', DIRECT_DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_URL_NON_POOLING: '',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', DB_NAME: '',
    PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGPASSWORD: '', PGDATABASE: 'postgres', PGSSLMODE: 'disable',
    AYK_TEST_PORT: String(port), AYK_TEST_DB: names[0], AYK_MEDIA_TEST_DB: names[1], AYK_LOCATION_TEST_DB: names[2],
    AYK_DISTRICTS_TEST_DB: 'ayk_test_districts_suite', AYK_AUTH_LOCATION_TEST_DB: 'ayk_test_authlocation_suite',
    AYK_GEO_TEST_DB: 'ayk_test_geo_suite', AYK_MAPS_TEST_DB: 'ayk_test_maps_suite', AYK_CALLS_TEST_DB: 'ayk_test_calls_suite', AYK_ADS_TEST_DB: 'ayk_test_ads_suite', AYK_SECURITY_CATALOG_TEST_DB: 'ayk_test_catalog_suite',
    AYK_ADMIN_USERNAME_TEST: '1', AYK_SECURITY_AUTH_TEST: '1', AYK_SECURITY_VERIFICATION_POLICY_TEST: '1',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '',
    WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
    NO_PROXY: [process.env.NO_PROXY, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(','),
  });
  const suites = fs.readdirSync(path.join(root, 'server/tests')).filter(name => name.endsWith('.integration.js')).sort().map(name => path.join(root, 'server/tests', name));
  if (!suites.length || interrupted) throw new Error('No integration suites found, or verification interrupted.');
  child = spawn(process.execPath, ['--test', '--test-concurrency=3', ...suites], { cwd: root, env, stdio: 'inherit' });
  exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
}
async function cleanup() {
  if (!owned.length) return;
  const admin = maintenance();
  await admin.connect();
  try {
    for (const name of owned) {
      if (!/^ayk_test_(marketplace|media|location)_[a-f0-9]{20}$/.test(name)) throw new Error('Invalid owned database name.');
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  } finally { await admin.end(); }
  console.log(`Removed ${owned.length} databases created by this reconstructed runner.`);
}
main().catch(error => { console.error(`Integration verification failed: ${error.message}`); }).finally(async () => {
  try { await cleanup(); } catch { exitCode = 1; console.error('Owned test database cleanup failed; inspect this dedicated localhost test instance.'); }
  process.exitCode = exitCode;
});
