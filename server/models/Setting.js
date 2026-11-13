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

async function get(key, defaultValue = null) {
  const row = await queryOne('SELECT * FROM settings WHERE setting_key = ?', [key]);
  if (!row) return defaultValue;
  const v = parseValue(row);
  return v == null ? defaultValue : v;
}

async function getMany(keys) {
  if (!Array.isArray(keys) || !keys.length) return {};
  const rows = await query(
    `SELECT * FROM settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const result = {};
  for (const r of rows) result[r.setting_key] = parseValue(r);
  return result;
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
}

module.exports = { get, getMany, getPublic, getAll, set, updateMany };
