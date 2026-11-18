const { query, queryOne, transaction } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

function parseValue(row) {
  if (!row) return null;
  let v = row.setting_value;
  switch (row.setting_type) {
    case 'number': v = v == null ? null : Number(v); break;
    case 'boolean': v = v === 'true' || v === '1'; break;
    case 'json': try { v = v ? JSON.parse(v) : null; } catch (_) { v = null; } break;
    default: break;
  }
  return v;
}

// AYK-252: settings are read on almost every request (who may write, whether views are public,
// the media limits...), each time with its own query. All of them (a few dozen rows) are now read
// once and kept for 5 seconds; everyone asking meanwhile shares that one read. A change made
// through this model shows at once in this server copy and within 5 seconds in the others.
// Off in tests (they change settings straight in the database and expect it at once).
const SNAPSHOT_MS = process.env.NODE_ENV === 'test' ? 0 : 5000;
let snapshot = null; // { at, rows: Map(key -> row) } | { pending }
function forgetSnapshot() { snapshot = null; }
async function allRows() {
  if (!SNAPSHOT_MS) return null;
  if (snapshot?.rows && Date.now() - snapshot.at < SNAPSHOT_MS) return snapshot.rows;
  if (snapshot?.pending) return snapshot.pending;
  const pending = query('SELECT * FROM settings').then(rows => {
    const map = new Map(rows.map(row => [row.setting_key, row]));
    snapshot = { at: Date.now(), rows: map };
    return map;
  }, err => { snapshot = null; throw err; });
  snapshot = { pending };
  return pending;
}

async function get(key, defaultValue = null) {
  const rows = await allRows();
  const row = rows ? rows.get(key) : await queryOne('SELECT * FROM settings WHERE setting_key = ?', [key]);
  if (!row) return defaultValue;
  const v = parseValue(row);
  return v == null ? defaultValue : v;
}

async function getMany(keys) {
  if (!Array.isArray(keys) || !keys.length) return {};
  const cached = await allRows();
  const rows = cached ? keys.map(key => cached.get(key)).filter(Boolean) : await query(
    `SELECT * FROM settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const result = {};
  for (const r of rows) result[r.setting_key] = parseValue(r);
  return result;
}

// Raw text values of some keys, for callers that parse them themselves (the marketplace policy).
async function rawValues(keys) {
  const cached = await allRows();
  if (!cached) return null;
  return keys.map(key => cached.get(key)).filter(Boolean).map(row => ({ setting_key: row.setting_key, setting_value: row.setting_value }));
}

async function getPublic() {
  const rows = await query('SELECT * FROM settings WHERE is_public = 1');
  const result = {};
  for (const r of rows) {
    if (!/(?:secret|password|token|private|credential|encryption|translate_api_key)/i.test(r.setting_key)) {
      result[r.setting_key] = parseValue(r);
    }
  }
  return result;
}

async function getAll() {
  const rows = await query('SELECT * FROM settings ORDER BY setting_group, setting_key');
  return rows.map(r => ({ ...r, parsed_value: parseValue(r) }));
}

async function set(key, value, type = 'string', group = 'general', isPublic = 0, description = null) {
  let stored = value;
  if (type === 'json') stored = JSON.stringify(value);
  else if (type === 'boolean') stored = value ? 'true' : 'false';
  else if (stored != null) stored = String(stored);

  await query(
    `INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value,
                             setting_type = EXCLUDED.setting_type,
                             setting_group = EXCLUDED.setting_group,
                             is_public = EXCLUDED.is_public,
                             description = COALESCE(EXCLUDED.description, settings.description)`,
    [key, stored, type, group, isPublic ? 1 : 0, description]
  );
  forgetSnapshot();
  return get(key);
}

async function updateMany(items) {
  if (!Array.isArray(items) || items.length > 200) throw new ApiError('Invalid settings', 400);
  await transaction(async conn => {
    for (const it of items) {
      if (!it || typeof it.key !== 'string' || !it.key || it.key.length > 100) throw new ApiError('Invalid setting key', 400);
      const [rows] = await conn.execute('SELECT setting_type FROM settings WHERE setting_key = ? FOR UPDATE', [it.key]);
      if (!rows.length) throw new ApiError('Unknown setting key', 400);
      const type = rows[0].setting_type;
      let stored;
      if (type === 'json') {
        try { stored = JSON.stringify(it.value); } catch (_) { throw new ApiError('Invalid JSON setting', 400); }
      } else if (type === 'number') {
        if (it.value == null || it.value === '' || typeof it.value === 'boolean' || !Number.isFinite(Number(it.value))) throw new ApiError('Invalid number setting', 400);
        stored = String(Number(it.value));
      } else if (type === 'boolean') {
        if (![true, false, 0, 1, 'true', 'false', '0', '1'].includes(it.value)) throw new ApiError('Invalid boolean setting', 400);
        stored = [true, 1, 'true', '1'].includes(it.value) ? 'true' : 'false';
      } else {
        if (it.value != null && typeof it.value !== 'string' && typeof it.value !== 'number') throw new ApiError('Invalid setting value', 400);
        stored = it.value == null ? null : String(it.value);
      }
      if (stored === undefined || (stored !== null && Buffer.byteLength(stored) > 20000)) throw new ApiError('Setting value is too large', 400);
      // Type, group and visibility belong to the server's registry, not a form payload.
      await conn.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [stored, it.key]);
    }
  });
  forgetSnapshot();
}

module.exports = { get, getMany, getPublic, getAll, set, updateMany, rawValues, forgetSnapshot };
