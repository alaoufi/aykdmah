const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../config/env');
const { hashPassword } = require('../utils/hash');
const logger = require('../utils/logger');
const { translateMysqlFunctions } = require('../config/database');

function checkRequirements() {
  const checks = {};

  checks.node_version = {
    name: 'إصدار Node.js',
    required: '>= 22.12',
    actual: process.version,
    ok: Number(process.versions.node.split('.')[0]) > 22 ||
      (Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) >= 12),
  };

  const schemaPath = env.PATHS.SCHEMA_SQL;
  checks.schema_file = {
    name: 'ملف schema.sql',
    required: schemaPath,
    actual: fs.existsSync(schemaPath) ? 'موجود' : 'مفقود',
    ok: fs.existsSync(schemaPath),
  };

  const seedPath = env.PATHS.SEED_SQL;
  checks.seed_file = {
    name: 'ملف seed.sql',
    required: seedPath,
    actual: fs.existsSync(seedPath) ? 'موجود' : 'مفقود',
    ok: fs.existsSync(seedPath),
  };

  const envPath = path.join(env.PATHS.ROOT, '.env');
  let envWritable = true;
  try {
    if (fs.existsSync(envPath)) fs.accessSync(envPath, fs.constants.W_OK);
    else fs.accessSync(env.PATHS.ROOT, fs.constants.W_OK);
  } catch (_) { envWritable = false; }
  checks.env_writable = {
    name: 'صلاحية الكتابة على .env',
    required: 'write',
    actual: envWritable ? 'متاح' : 'غير متاح',
    ok: envWritable,
  };

  const uploadDir = env.UPLOAD.DIR;
  let uploadsWritable = true;
  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.accessSync(uploadDir, fs.constants.W_OK);
  } catch (_) { uploadsWritable = false; }
  checks.uploads_writable = {
    name: 'صلاحية الكتابة على مجلد uploads',
    required: 'write',
    actual: uploadsWritable ? 'متاح' : 'غير متاح',
    ok: uploadsWritable,
  };

  const allOk = Object.values(checks).every(c => c.ok);
  return { checks, allOk };
}

function buildSsl() {
  return require('../config/database').buildSsl(env.DB);
}

function clientOptions(extra = {}) {
  const url = env.DB.DIRECT_URL || env.DB.URL;
  if (url) {
    // Transaction poolers cannot preserve session advisory locks. Schema
    // jobs must connect to the direct endpoint rather than the app's pooler.
    if (/-pooler\./i.test(new URL(url).hostname)) {
      throw new Error('Set DIRECT_DATABASE_URL to a non-pooled endpoint before running database setup or migrations.');
    }
    const { poolOptions } = require('../config/database');
    const { connectionString, ssl } = poolOptions({ ...env.DB, URL: url });
    return { connectionString, ssl, ...extra };
  }
  return {
    host: env.DB.HOST,
    port: env.DB.PORT,
    user: env.DB.USER,
    password: env.DB.PASSWORD,
    database: env.DB.NAME,
    ssl: buildSsl(),
    ...extra,
  };
}

async function testDbConnection(config) {
  const client = new Client({
    host: config.host,
    port: parseInt(config.port || 5432, 10),
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: buildSsl(),
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
  return true;
}

// ─── MySQL → PostgreSQL translator ──────────────────────────────────────
//
// The schema, seed and migration files are still authored in MySQL
// dialect (legacy from when the project ran on MySQL). Rather than
// dual-maintaining a second set of files, we translate at boot. This
// covers the patterns the project actually uses; uncovered patterns
// (notably ON DUPLICATE KEY UPDATE) are rewritten directly in JS.

function mysqlToPg(sql) {
  let s = sql;

  // Shared function-level translations (DATE_SUB, GROUP_CONCAT, RAND, …)
  s = translateMysqlFunctions(s);

  // Strip MySQL-only session pragmas that have no PG equivalent.
  s = s.replace(/^\s*SET\s+NAMES\b[^;]*;?\s*$/gim, '');
  s = s.replace(/^\s*SET\s+FOREIGN_KEY_CHECKS\s*=\s*[01]\s*;?\s*$/gim, '');

  // Backticks → omit. Postgres uses double quotes for case-sensitive
  // identifiers; everything here is already lowercase so just drop them.
  s = s.replace(/`/g, '');

  // Trailing table options:   ) ENGINE=InnoDB DEFAULT CHARSET=… COLLATE=…
  // After splitSql the terminating ; is gone, so we anchor on end-of-string.
  s = s.replace(/\)\s*ENGINE\s*=\s*\w+[\s\S]*$/i, ')');

  // Stray CHARACTER SET / COLLATE clauses on columns
  s = s.replace(/CHARACTER\s+SET\s+\w+/gi, '');
  s = s.replace(/COLLATE\s+\w+/gi, '');

  // AUTO_INCREMENT — convert before paring back the type
  s = s.replace(/\bBIGINT\s+AUTO_INCREMENT\b/gi, 'BIGSERIAL');
  s = s.replace(/\b(?:INT|INTEGER)\s+AUTO_INCREMENT\b/gi, 'SERIAL');

  // Width-specified numeric types — drop the width (PG ignores it).
  s = s.replace(/\bINT\s*\(\s*\d+\s*\)/gi, 'INT');
  s = s.replace(/\bBIGINT\s*\(\s*\d+\s*\)/gi, 'BIGINT');
  s = s.replace(/\bTINYINT\s*\(\s*\d+\s*\)/gi, 'SMALLINT');
  s = s.replace(/\bTINYINT\b/gi, 'SMALLINT');
  s = s.replace(/\bMEDIUMINT\b/gi, 'INT');
  s = s.replace(/\b(?:LONGTEXT|MEDIUMTEXT|TINYTEXT)\b/gi, 'TEXT');
  s = s.replace(/\b(?:LONGBLOB|MEDIUMBLOB|TINYBLOB|BLOB)\b/gi, 'BYTEA');

  // Date/time
  s = s.replace(/\bDATETIME\b/gi, 'TIMESTAMP');

  // JSON → JSONB (better indexing + faster operators)
  s = s.replace(/\bJSON\b(?![A-Z_])/g, 'JSONB');

  // ENUM('a','b'[,'c'...]) → TEXT CHECK (col IN ('a','b'))
  // Matches both inline column definitions and ALTER TABLE ADD COLUMN forms.
  s = s.replace(/\b(\w+)\s+ENUM\s*\(([^)]+)\)/g, (_, col, values) =>
    `${col} TEXT CHECK (${col} IN (${values}))`
  );

  // ON UPDATE CURRENT_TIMESTAMP — Postgres has no native equivalent.
  // We install a generic trigger after CREATE statements run that
  // sets updated_at = now() on every UPDATE. Strip from DDL.
  s = s.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '');

  // UNIQUE KEY name (cols) → CONSTRAINT name UNIQUE (cols)
  s = s.replace(/UNIQUE\s+KEY\s+(\w+)\s*\(([^)]+)\)/gi, 'CONSTRAINT $1 UNIQUE ($2)');
  s = s.replace(/UNIQUE\s+INDEX\s+(\w+)\s*\(([^)]+)\)/gi, 'CONSTRAINT $1 UNIQUE ($2)');

  // Inline `INDEX name (cols)` or `KEY name (cols)` inside CREATE TABLE
  // body — these are not valid SQL in Postgres. We strip them; the
  // CREATE INDEX must live outside the CREATE TABLE. For our use, the
  // primary and unique keys are indexed automatically; foreign keys need
  // separate supporting indexes in PostgreSQL. The extras are
  // perf hints we'll re-add only if profiling demands it.
  s = s.replace(/,\s*(?:KEY|INDEX)\s+\w+\s*\([^)]+\)/gi, '');
  s = s.replace(/^\s*(?:KEY|INDEX)\s+\w+\s*\([^)]+\)\s*,?\s*$/gim, '');

  // Trailing comma before closing paren of a CREATE TABLE (caused by
  // stripping inline KEY/INDEX).
  s = s.replace(/,(\s*\))/g, '$1');

  // INFORMATION_SCHEMA — PG uses lowercase + current_schema()
  s = s.replace(/INFORMATION_SCHEMA\.COLUMNS/gi, 'information_schema.columns');
  s = s.replace(/INFORMATION_SCHEMA\.TABLES/gi, 'information_schema.tables');
  s = s.replace(/TABLE_SCHEMA\s*=\s*DATABASE\s*\(\s*\)/gi,
    "table_schema = COALESCE(current_schema(), 'public')");

  // MySQL's ADD COLUMN ... AFTER <col> — Postgres always appends.
  // Strip the AFTER clause whether it's mid-statement or at the end.
  s = s.replace(/\s+AFTER\s+\w+/gi, '');

  // MODIFY COLUMN is MySQL-only. The schema.sql already declares the
  // canonical column type via TEXT CHECK; rewrite to a no-op so the
  // migration doesn't error and the data stays whatever schema.sql said.
  // No-op: SELECT 1 keeps it a single-statement, no $$ tokens (which
  // would trip splitSql's naive `;` splitter).
  s = s.replace(/^\s*ALTER\s+TABLE[^;]*\bMODIFY\s+COLUMN\b[^;]*$/gim, 'SELECT 1');

  // INSERT IGNORE INTO foo (...) VALUES (...)  →  INSERT INTO ... ON CONFLICT DO NOTHING
  s = s.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT');
  // We can't tell from the SQL alone if every INSERT was IGNORE-flavoured;
  // we wrap based on whether the original had it. Use a marker pattern:
  // statements that previously said "INSERT IGNORE" now just say INSERT
  // and need a trailing ON CONFLICT DO NOTHING. To find them, look at
  // the pre-translation text instead — handled by the runner below.

  return s;
}

// Apply the IGNORE→ON CONFLICT rewrite at the statement level so we can
// tell whether the original was IGNORE-flavoured.
function statementHadInsertIgnore(stmt) {
  return /\bINSERT\s+IGNORE\b/i.test(stmt);
}
function appendOnConflictDoNothing(stmt) {
  if (/\bON\s+CONFLICT\b/i.test(stmt)) return stmt; // already there
  return stmt.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
}

// Split a SQL script into statements, respecting Postgres
// dollar-quoted blocks ($$ … $$) so a DO block's internal semicolons
// don't get split mid-block.
const { splitSql } = require('../utils/sqlScript');

async function runSqlFile(client, filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const statements = splitSql(content);
  const results = { ok: 0, skipped: 0, errors: [] };
  for (const original of statements) {
    if (!original) continue;
    const wantsIgnore = statementHadInsertIgnore(original);
    let stmt = mysqlToPg(original);
    if (wantsIgnore) stmt = appendOnConflictDoNothing(stmt);
    try {
      await client.query(stmt);
      results.ok++;
    } catch (err) {
      // Postgres equivalents of MySQL tolerable errors:
      //   42P07 — duplicate table
      //   42701 — duplicate column
      //   42710 — duplicate object (index/constraint)
      //   42703 — undefined column (drops we can ignore on partial schemas)
      //   23505 — unique violation (rerun of seed)
      //   42P06 — duplicate schema
      const ddlDuplicate = ['42P07', '42701', '42710', '42P06'].includes(err.code)
        && /^\s*(?:CREATE|ALTER)\b/i.test(stmt);
      const optionalSpatial = /^(?:CREATE EXTENSION IF NOT EXISTS postgis|ALTER TABLE (?:users|provider_profiles|requests)\s+ADD COLUMN IF NOT EXISTS geom geography\(|CREATE INDEX IF NOT EXISTS idx_(?:users|provider_profiles|requests)_geom\s+ON)/i.test(stmt);
      const optionalFailure = optionalSpatial && ['42703', '42704', '42501', '0A000'].includes(err.code);
      if (ddlDuplicate || optionalFailure) { results.skipped++; continue; }
      results.errors.push({
        code: err.code,
        message: String(err.message).slice(0, 200),
        sql: stmt.slice(0, 200),
      });
    }
  }
  return results;
}

// Bring every auto-increment sequence in line with MAX(id) so the next
// INSERT after a seed that hardcoded ids doesn't collide with a low
// sequence value. Postgres doesn't bump the sequence when explicit ids
// are inserted, so without this we get unique-violation errors.
async function syncSequences(client) {
  // Find every SERIAL/BIGSERIAL column (pg_get_serial_sequence returns
  // null for non-serial columns).
  const cols = (await client.query(`
    SELECT c.table_schema, c.table_name, c.column_name,
           pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = COALESCE(current_schema(), 'public')
      AND c.column_default LIKE 'nextval(%'
  `)).rows;
  const quote = value => `"${String(value).replace(/"/g, '""')}"`;
  for (const { table_schema: schema, table_name: t, column_name: col, seq } of cols) {
    if (!seq) continue;
    const table = `${quote(schema)}.${quote(t)}`;
    try {
      await client.query('BEGIN');
      await client.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
      await client.query(
        `SELECT setval($1::regclass, GREATEST(
          COALESCE((SELECT MAX(${quote(col)}) FROM ${table}), 0) + 1,
          (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM ${seq})
        ), false)`, [seq]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
}

// Single function + per-table trigger that fills in updated_at on UPDATE.
// Replaces MySQL's `ON UPDATE CURRENT_TIMESTAMP` for every table that
// has the column. Idempotent.
async function installUpdatedAtTrigger(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  // Find every table that has an updated_at column and ensure a trigger exists.
  const rows = (await client.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = COALESCE(current_schema(), 'public')
      AND column_name = 'updated_at'
  `)).rows;
  for (const { table_name: t } of rows) {
    const trig = `trg_${t}_updated_at`;
    await client.query(`DROP TRIGGER IF EXISTS ${trig} ON ${t};`);
    await client.query(`CREATE TRIGGER ${trig} BEFORE UPDATE ON ${t}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();`);
  }
}

async function runAllMigrations(client) {
  const dir = path.join(path.dirname(env.PATHS.SCHEMA_SQL), 'migrations');
  if (!fs.existsSync(dir)) return { applied: [], dir };
  await client.query('SELECT pg_advisory_lock(742981)');
  try {
    const ready = await client.query("SELECT to_regclass('users') AS users");
    if (!ready.rows[0].users) return { applied: [], dir };
    // Seeds and older migrations insert explicit IDs. Repair sequences before
    // any subsequent migration allocates IDs, preserving their high-water mark.
    await syncSequences(client);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const existing = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    const applied = [];
    for (const f of files) {
      if (existing.has(f)) continue;
      const result = await runSqlFile(client, path.join(dir, f));
      applied.push({ file: f, ...result });
      if (!result.errors.length) {
        await syncSequences(client);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      } else break; // Never mark or run later migrations after an incomplete one.
    }
    return { applied, dir };
  } finally {
    await client.query('SELECT pg_advisory_unlock(742981)');
  }
}

async function performInstall({ db, site, admin }) {
  const client = new Client({
    host: db.host,
    port: parseInt(db.port || 5432, 10),
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: buildSsl(),
  });
  await client.connect();

  try {
    const existing = await client.query("SELECT to_regclass('users') AS users");
    if (existing.rows[0].users) {
      throw new Error('Installation requires a fresh database; use tracked migrations for an existing installation.');
    }
    const schema = await runSqlFile(client, env.PATHS.SCHEMA_SQL);
    const seed = await runSqlFile(client, env.PATHS.SEED_SQL);
    if (schema.errors.length || seed.errors.length) throw new Error('Database schema or seed failed; installation was not completed.');
    const migrations = await runAllMigrations(client);
    if (migrations.applied.some(m => m.errors.length)) throw new Error('Database migrations failed; installation was not completed.');
    await installUpdatedAtTrigger(client);
    await syncSequences(client);

    const passwordHash = await hashPassword(admin.password);
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active, is_verified, is_super_admin)
       VALUES ($1, $2, $3, 'admin', 1, 1, 1)`,
      [admin.full_name, admin.email, passwordHash]
    );

    const settingsToUpdate = [
      ['site_name', site.name || 'AY KHIDMA'],
      ['site_url', site.url || ''],
      ['site_email', site.email || ''],
      ['default_language', site.language || 'ar'],
    ];
    for (const [k, v] of settingsToUpdate) {
      await client.query(
        `INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public)
         VALUES ($1, $2, 'string', 'general', 1)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [k, v]
      );
    }

    await client.query(
      `INSERT INTO install_lock (is_installed, installed_at, installed_version, installed_by_email, site_name, site_url)
       VALUES (1, CURRENT_TIMESTAMP, '1.0.0', $1, $2, $3)`,
      [admin.email, site.name || '', site.url || '']
    );

    await client.end();
  } catch (err) {
    try { await client.end(); } catch (_) { /* ignore */ }
    throw err;
  }

  writeEnvFile({ db, site });
  fs.writeFileSync(env.PATHS.INSTALL_LOCK_FILE, JSON.stringify({
    installed_at: new Date().toISOString(),
    version: '1.0.0',
    admin_email: admin.email,
    site_name: site.name,
  }, null, 2));

  logger.info('Installation completed successfully');
  return { ok: true };
}

function writeEnvFile({ db, site }) {
  const envPath = path.join(env.PATHS.ROOT, '.env');
  const examplePath = path.join(env.PATHS.ROOT, '.env.example');
  let content = '';
  if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
  else if (fs.existsSync(examplePath)) content = fs.readFileSync(examplePath, 'utf8');

  const lines = content.split('\n');
  const map = {
    APP_NAME: site.name || 'AY KHIDMA',
    APP_URL: site.url || '',
    CLIENT_URL: site.url || '',
    DATABASE_URL: '',
    DB_HOST: db.host,
    DB_PORT: String(db.port || 5432),
    DB_NAME: db.database,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
  };
  const existingKeys = new Set();
  const updated = lines.map(line => {
    const m = line.match(/^([A-Z_]+)=/);
    if (!m) return line;
    const key = m[1];
    existingKeys.add(key);
    if (map[key] !== undefined) return `${key}=${String(map[key])}`;
    return line;
  });
  for (const [k, v] of Object.entries(map)) {
    if (!existingKeys.has(k)) updated.push(`${k}=${v}`);
  }
  if (!existingKeys.has('JWT_SECRET')) {
    updated.push(`JWT_SECRET=${require('crypto').randomBytes(48).toString('hex')}`);
  } else {
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].startsWith('JWT_SECRET=') && (!updated[i].slice('JWT_SECRET='.length) || updated[i].slice('JWT_SECRET='.length).length < 32 || updated[i] === 'JWT_SECRET=change_me_to_a_long_random_string')) {
        updated[i] = `JWT_SECRET=${require('crypto').randomBytes(48).toString('hex')}`;
      }
    }
  }
  fs.writeFileSync(envPath, updated.join('\n'), { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}

function resolveSqlPath(name, primary) {
  const candidates = [
    primary,
    path.join(process.cwd(), 'database', name),
    path.join(__dirname, '..', '..', 'database', name),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error(`SQL file not found: ${name}`);
}

// Initialise schema + seed through the trusted deployment/CLI path. HTTP
// installation is retired. Only explicitly supported duplicate DDL and
// optional spatial-extension failures are tolerated.
async function setupFromEnv() {
  const client = new Client(clientOptions({ connectionTimeoutMillis: 15000 }));
  await client.connect();
  try {
    const schema = await runSqlFile(client, resolveSqlPath('schema.sql', env.PATHS.SCHEMA_SQL));
    const seed = await runSqlFile(client, resolveSqlPath('seed.sql', env.PATHS.SEED_SQL));
    if (schema.errors.length || seed.errors.length) throw new Error('Database schema or seed failed; setup was not completed.');
    const migrations = await runAllMigrations(client);
    if (migrations.applied.some(m => m.errors.length)) {
      throw new Error('Database migrations failed; setup was not completed.');
    }
    await installUpdatedAtTrigger(client);
    await syncSequences(client);
    const r = await client.query("SELECT COUNT(*)::int AS admins FROM users WHERE role = 'admin'");
    await client.end();
    return { admins: r.rows[0] ? r.rows[0].admins : 0, migrations: migrations.applied };
  } catch (err) {
    try { await client.end(); } catch (_) { /* ignore */ }
    throw err;
  }
}

// Apply only the migrations directory (no schema/seed). Useful for
// upgrading an already-installed deployment.
async function runMigrationsFromEnv() {
  const client = new Client(clientOptions({ connectionTimeoutMillis: 15000 }));
  await client.connect();
  try {
    const result = await runAllMigrations(client);
    await installUpdatedAtTrigger(client);
    await syncSequences(client);
    await client.end();
    return result;
  } catch (err) {
    try { await client.end(); } catch (_) { /* ignore */ }
    throw err;
  }
}

module.exports = {
  checkRequirements, testDbConnection, performInstall,
  setupFromEnv, runMigrationsFromEnv, mysqlToPg, splitSql, clientOptions,
};
