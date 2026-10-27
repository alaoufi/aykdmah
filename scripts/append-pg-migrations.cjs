#!/usr/bin/env node
// Adds migrations that are missing from the PostgreSQL bootstrap (database/postgres/RUN-ME.sql)
// and from database/postgres/migrations, using the application's own MySQL→PostgreSQL
// translator. The original full generator (scripts/dump-pg-sql.js) was not part of the
// recovered source; this keeps the bootstrap in step with new migrations without
// rewriting the verified earlier sections. Idempotent.
// Usage: NODE_ENV=test node scripts/append-pg-migrations.cjs
process.env.NODE_ENV ||= 'test';
const fs = require('fs');
const path = require('path');
const { mysqlToPg, splitSql } = require('../server/services/installService');

const root = path.resolve(__dirname, '..');
const runMePath = path.join(root, 'database/postgres/RUN-ME.sql');
const marker = '\n-- updated_at triggers and monotonic sequence synchronization.';
let runMe = fs.readFileSync(runMePath, 'utf8');
if (!runMe.includes(marker)) throw new Error('RUN-ME.sql trailer not found');

const all = fs.readdirSync(path.join(root, 'database/migrations')).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
const missing = all.filter(name => !runMe.includes(`INSERT INTO schema_migrations(name) VALUES ('${name}');`));
const newTables = [];

for (const name of missing) {
  const source = fs.readFileSync(path.join(root, 'database/migrations', name), 'utf8');
  const statements = splitSql(mysqlToPg(source)).map(s => s.trim()).filter(Boolean);
  const body = statements.map(s => `${s.replace(/;\s*$/, '')};`).join('\n');
  for (const match of body.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)) newTables.push(match[1]);
  fs.writeFileSync(path.join(root, 'database/postgres/migrations', name),
    `-- Auto-generated from database/migrations/${name}\n-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/append-pg-migrations.cjs'\n\n${body}\n`);
  runMe = runMe.replace(marker, `\n-- migrations/${name}\n${body}\nINSERT INTO schema_migrations(name) VALUES ('${name}');\n${marker}`);
  console.log('added', name);
}

// The fresh-database guard must also refuse databases that already have the new tables.
if (newTables.length) {
  runMe = runMe.replace(/AND c\.relname IN \(([^)]*)\)/, (all, list) => {
    const names = new Set(list.split(',').map(s => s.trim().replace(/^'|'$/g, '')));
    newTables.forEach(t => names.add(t));
    return `AND c.relname IN (${[...names].sort().map(n => `'${n}'`).join(',')})`;
  });
}
fs.writeFileSync(runMePath, runMe);
console.log(missing.length ? `RUN-ME.sql updated (${missing.length} migrations)` : 'RUN-ME.sql already up to date');
