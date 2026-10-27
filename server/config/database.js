// PostgreSQL adapter — same export surface as the previous mysql2 layer
// so the dozens of model files don't need to be touched.
//
// On the fly we translate the MySQL idioms still living in the codebase:
//   ?                            → $1, $2, $3 …      (pg uses indexed placeholders)
//   INSERT IGNORE                → INSERT … ON CONFLICT DO NOTHING
//   bare INSERT (no RETURNING)   → INSERT … RETURNING *   (so .insertId works)
//
// And we shape the result object so callers can keep using
//   result.insertId    (from RETURNING id)
//   result.affectedRows (from rowCount)
// exactly like with mysql2.
//
// ON DUPLICATE KEY UPDATE and bulk `VALUES ?` arrays are NOT translated
// here — those are rewritten manually in the few model files that use
// them, since the Postgres equivalents need column hints we can't infer.

const { Pool } = require('pg');
const env = require('./env');

let pool = null;

function buildSsl(config) {
  const mode = String(config.SSL || '').trim().toLowerCase();
  // Explicit opt-out always wins
  if (mode === 'false' || mode === '0' || mode === 'disable') return false;
  if (mode === 'strict' || config.URL) return { rejectUnauthorized: true };
  if (!mode) return false;
  return { rejectUnauthorized: true };
}

function poolOptions(config) {
  const configuredMax = Number(config.POOL_MAX);
  const max = Number.isInteger(configuredMax) && configuredMax > 0
    ? configuredMax : (process.env.VERCEL ? 3 : 10);
  if (config.URL) {
    // Strip any inherited ssl=/sslmode= query params from the URL — pg's
    // own SSL config (which we pass explicitly) should be the only thing
    // deciding handshake behaviour. Leaving both routes active is what
    // most often causes the "establishing an SSL connection" wrap error.
    const parsedUrl = new URL(config.URL);
    parsedUrl.searchParams.delete('ssl');
    parsedUrl.searchParams.delete('sslmode');
    const url = parsedUrl.toString();
    return {
      connectionString: url,
      ssl: buildSsl(config),
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    };
  }
  return {
    host: config.HOST,
    port: config.PORT,
    user: config.USER,
    password: config.PASSWORD,
    database: config.NAME,
    ssl: buildSsl(config),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };
}

function createPool(config) {
  const created = new Pool(poolOptions(config));
  // PostgreSQL can close idle connections during failover or maintenance.
  // pg removes that client; handle its event so the API process stays alive
  // and subsequent queries can open a replacement connection.
  created.on('error', err => require('../utils/logger').error('Idle database connection failed', err));
  return created;
}

function getPool() {
  if (!pool) pool = createPool(env.DB);
  return pool;
}

// ─── MySQL → Postgres compat helpers ────────────────────────────────────

// Map common MySQL functions used across the codebase to their Postgres
// equivalents. Only targets patterns we actually use — anything weirder
// must be rewritten directly in the calling JS file.
function translateMysqlFunctions(s) {
  // DATE_SUB(x, INTERVAL n UNIT)  →  (x - n * INTERVAL '1 unit')
  s = s.replace(/DATE_SUB\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s+(\S+)\s+(DAY|HOUR|MINUTE|SECOND|MONTH|YEAR|WEEK)\s*\)/gi,
    (_, base, n, unit) => `(${base.trim()} - ((${n})::int) * INTERVAL '1 ${unit.toLowerCase()}')`);
  // DATE_ADD same pattern
  s = s.replace(/DATE_ADD\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s+(\S+)\s+(DAY|HOUR|MINUTE|SECOND|MONTH|YEAR|WEEK)\s*\)/gi,
    (_, base, n, unit) => `(${base.trim()} + ((${n})::int) * INTERVAL '1 ${unit.toLowerCase()}')`);
  // GROUP_CONCAT(x SEPARATOR 'y')  →  string_agg(x::text, 'y')
  s = s.replace(/GROUP_CONCAT\s*\(\s*([^)]+?)\s+SEPARATOR\s+('[^']*')\s*\)/gi,
    (_, expr, sep) => `string_agg((${expr.trim()})::text, ${sep})`);
  // GROUP_CONCAT(x) without separator  →  string_agg(x::text, ',')
  s = s.replace(/GROUP_CONCAT\s*\(\s*([^)]+?)\s*\)/gi,
    (_, expr) => `string_agg((${expr.trim()})::text, ',')`);
  // RAND() → random()
  s = s.replace(/\bRAND\s*\(\s*\)/gi, 'random()');
  // IFNULL → COALESCE
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  // JSON_ARRAY('a','b') → jsonb_build_array('a','b')
  s = s.replace(/\bJSON_ARRAY\s*\(/gi, 'jsonb_build_array(');
  // JSON_OBJECT('k', v) → jsonb_build_object('k', v)
  s = s.replace(/\bJSON_OBJECT\s*\(/gi, 'jsonb_build_object(');
  return s;
}

function translateSql(sql) {
  let s = sql;
  s = translateMysqlFunctions(s);
  // INSERT IGNORE  → INSERT … ON CONFLICT DO NOTHING
  if (/^\s*INSERT\s+IGNORE\b/i.test(s)) {
    s = s.replace(/^(\s*)INSERT\s+IGNORE/i, '$1INSERT');
    if (!/\bON\s+CONFLICT\b/i.test(s)) {
      s = s.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
    }
  }
  // Make plain INSERTs return everything so we can populate insertId.
  // Skip queries that already have ON CONFLICT — those may have a
  // DO UPDATE … RETURNING clause; safer to leave intact.
  if (/^\s*INSERT\b/i.test(s) && !/\bRETURNING\b/i.test(s) && !/\bON\s+CONFLICT\b/i.test(s)) {
    s = s.replace(/;?\s*$/, ' RETURNING *');
  }
  // ?  →  $1, $2, $3 …
  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);
  return s;
}


function shapeResult(originalSql, result) {
  const head = originalSql.trim().toUpperCase();
  if (head.startsWith('INSERT')) {
    const first = result.rows && result.rows[0];
    const arr = result.rows || [];
    arr.insertId = first && first.id != null ? first.id : 0;
    arr.affectedRows = result.rowCount || 0;
    return arr;
  }
  if (head.startsWith('UPDATE') || head.startsWith('DELETE')) {
    const arr = [];
    arr.affectedRows = result.rowCount || 0;
    return arr;
  }
  return result.rows || [];
}

// ─── Public API (matches the old mysql2-flavoured surface) ──────────────

async function query(sql, params = []) {
  const pgsql = translateSql(sql);
  const result = await getPool().query(pgsql, params);
  return shapeResult(sql, result);
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows && rows.length ? rows[0] : null;
}

// Transactions expose mysql2-compatible query/execute methods returning
// [rowsOrResult, fields]. Queries and writes both translate placeholders.
async function transaction(callback) {
  const client = await getPool().connect();
  // Tiny shim that mimics the bits of mysql2 the codebase uses
  // inside transactions:
  //   await conn.execute(sql, params)  →  [result, fields]
  //                                       result.insertId, result.affectedRows
  const execute = async (sql, params = []) => {
    const result = await client.query(translateSql(sql), params);
    return [shapeResult(sql, result), undefined];
  };
  // Both methods follow mysql2's [rowsOrResult, fields] contract.
  const shim = { query: execute, execute };

  try {
    await client.query('BEGIN');
    const result = await callback(shim);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection(config) {
  const tempPool = createPool(config || env.DB);
  try {
    const client = await tempPool.connect();
    await client.query('SELECT 1');
    client.release();
    await tempPool.end();
    return true;
  } catch (err) {
    try { await tempPool.end(); } catch (_) { /* ignore */ }
    throw err;
  }
}

function resetPool() {
  if (pool) {
    try { pool.end(); } catch (_) { /* ignore */ }
    pool = null;
  }
  COLUMN_CACHE.clear();
}

// ─── Column-presence cache (used by self-heal code paths) ───────────────
//
// information_schema in Postgres uses lowercased catalog conventions —
// table_schema='public' for the default schema.
const COLUMN_CACHE = new Map();

async function tableHasColumn(table, column) {
  const key = `${table}.${column}`;
  if (COLUMN_CACHE.has(key)) return COLUMN_CACHE.get(key);
  try {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
         WHERE table_schema = COALESCE(current_schema(), 'public')
           AND table_name = ?
           AND column_name = ?
         LIMIT 1`,
      [table, column]
    );
    const exists = rows.length > 0;
    COLUMN_CACHE.set(key, exists);
    return exists;
  } catch (_) {
    return true;
  }
}

function invalidateColumnCache() { COLUMN_CACHE.clear(); }

module.exports = {
  getPool, query, queryOne, transaction, testConnection, resetPool,
  tableHasColumn, invalidateColumnCache,
  translateMysqlFunctions, translateSql, buildSsl, poolOptions,
};
