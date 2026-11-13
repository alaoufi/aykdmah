const { query, queryOne } = require('../config/database');
const { encryptJson, decryptJson, maskCredentials } = require('../utils/encryption');

function parseRow(row, { includeSecrets = false } = {}) {
  if (!row) return row;
  if (typeof row.config === 'string') {
    try { row.config = JSON.parse(row.config); } catch (_) { row.config = null; }
  }
  const decrypted = row.credentials_encrypted ? decryptJson(row.credentials_encrypted) : null;
  if (includeSecrets) {
    row.credentials = decrypted;
  } else {
    row.credentials_masked = maskCredentials(decrypted);
  }
  delete row.credentials_encrypted;
  if (row.last_test_ok === 0 && row.last_test_message) row.last_test_message = 'Provider request failed';
  return row;
}

async function list({ type, enabledOnly = false } = {}) {
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (enabledOnly) where.push('is_enabled = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT * FROM api_integrations ${whereSql} ORDER BY type ASC, is_primary DESC, id ASC`,
    params
  );
  return rows.map((r) => parseRow(r));
}

async function findById(id, opts = {}) {
  const row = await queryOne('SELECT * FROM api_integrations WHERE id = ?', [id]);
  return parseRow(row, opts);
}

async function findActive(type) {
  // Prefer the primary, fall back to the first enabled row.
  const row = await queryOne(
    `SELECT * FROM api_integrations
     WHERE type = ? AND is_enabled = 1
     ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [type]
  );
  return parseRow(row, { includeSecrets: true });
}

async function create({ type, provider, label, mode = 'sandbox', config = {}, credentials = null, is_enabled = 0, is_primary = 0, webhook_url = null, rate_limit_per_min = null, created_by = null }) {
  const enc = credentials ? encryptJson(credentials) : null;
  const result = await query(
    `INSERT INTO api_integrations
      (type, provider, label, mode, config, credentials_encrypted,
       is_enabled, is_primary, webhook_url, rate_limit_per_min, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [type, provider, label || null, mode, JSON.stringify(config || {}), enc,
     is_enabled ? 1 : 0, is_primary ? 1 : 0, webhook_url, rate_limit_per_min, created_by]
  );
  if (is_primary) await unsetOtherPrimary(type, result.insertId);
  return findById(result.insertId);
}

async function update(id, data) {
  const allowed = ['type', 'provider', 'label', 'mode', 'is_enabled', 'is_primary', 'webhook_url', 'rate_limit_per_min'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(typeof data[k] === 'boolean' ? (data[k] ? 1 : 0) : data[k]);
    }
  }
  if (data.config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(data.config || {}));
  }
  if (data.credentials !== undefined) {
    fields.push('credentials_encrypted = ?');
    values.push(data.credentials ? encryptJson(data.credentials) : null);
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await query(`UPDATE api_integrations SET ${fields.join(', ')} WHERE id = ?`, values);
  if (data.is_primary) {
    const row = await queryOne('SELECT type FROM api_integrations WHERE id = ?', [id]);
    if (row) await unsetOtherPrimary(row.type, id);
  }
  return findById(id);
}

async function unsetOtherPrimary(type, keepId) {
  await query(
    'UPDATE api_integrations SET is_primary = 0 WHERE type = ? AND id != ?',
    [type, keepId]
  );
}

async function remove(id) {
  await query('DELETE FROM api_integrations WHERE id = ?', [id]);
}

async function recordTestResult(id, ok, message) {
  await query(
    `UPDATE api_integrations
     SET last_test_at = CURRENT_TIMESTAMP, last_test_ok = ?, last_test_message = ?
     WHERE id = ?`,
    [ok ? 1 : 0, (message || '').slice(0, 250), id]
  );
}

async function logUsage({ integration_id = null, type, provider = null, user_id = null, action, status, http_status = null, request_meta = null, error_message = null, latency_ms = null }) {
  await query(
    `INSERT INTO api_usage_logs
      (integration_id, type, provider, user_id, action, status, http_status,
       request_meta, error_message, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [integration_id, type, provider, user_id, action, status, http_status,
     request_meta ? JSON.stringify(request_meta) : null,
     (error_message || null) && String(error_message).slice(0, 490),
     latency_ms]
  );
}

async function listUsage({ type, status, page = 1, limit = 50 } = {}) {
  page = Math.max(1, Math.min(100000, Math.trunc(Number(page) || 1)));
  limit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 50)));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = await query(
    `SELECT * FROM api_usage_logs ${whereSql}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM api_usage_logs ${whereSql}`, params);
  return { items: items.map(item => ({ ...item, error_message: item.error_message ? 'Provider request failed' : null })), total };
}

module.exports = {
  list, findById, findActive, create, update, remove,
  recordTestResult, logUsage, listUsage,
};
