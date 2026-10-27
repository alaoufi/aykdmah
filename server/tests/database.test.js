const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSql } = require('../utils/sqlScript');
const { poolOptions, translateSql } = require('../config/database');

test('SQL scripts preserve semicolons and comments inside quoted values and function bodies', () => {
  const parts = splitSql(`-- comment\nINSERT INTO x VALUES ('a;b -- text', 'it''s /* data */');
    DO $block$ BEGIN PERFORM 1; PERFORM 2; END $block$;
    /* block comment; */ SELECT 3;`);
  assert.equal(parts.length, 3);
  assert.match(parts[0], /a;b -- text/);
  assert.match(parts[0], /it's|it''s/);
  assert.match(parts[1], /PERFORM 1; PERFORM 2/);
  assert.equal(parts[2], 'SELECT 3');
});
test('strict TLS wins over URL defaults and keeps other URL options intact', () => {
  const config = poolOptions({ URL: 'postgres://user:pass@localhost/db?sslmode=require&application_name=ryza', SSL: 'strict' });
  assert.equal(config.ssl.rejectUnauthorized, true);
  const url = new URL(config.connectionString);
  assert.equal(url.searchParams.get('application_name'), 'ryza');
  assert.equal(url.searchParams.has('sslmode'), false);
  assert.equal(poolOptions({ URL: 'postgres://localhost/db', SSL: 'false' }).ssl, false);
});
test('bound subscription interval SQL is translated for PostgreSQL', () => {
  assert.match(translateSql('SELECT DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)'), /\$1/);
  assert.match(translateSql('INSERT INTO users (full_name) VALUES (?)'), /RETURNING \*/);
});
test('production refuses a placeholder signing secret and accepts a configured secret', () => {
  const { spawnSync } = require('node:child_process');
  const script = "require('./config/env')";
  const weak = spawnSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'change_me_to_a_long_random_string' } });
  assert.notEqual(weak.status, 0);
  assert.match(weak.stderr.toString(), /unique JWT_SECRET/);
  const strong = spawnSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: require('node:crypto').randomBytes(48).toString('hex') } });
  assert.equal(strong.status, 0);
});
