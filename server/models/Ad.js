const { query, queryOne, tableHasColumn, transaction } = require('../config/database');
const { pagination, invalid } = require('./Payment');

function paymentGuard(alias = 'ads') {
  return `(${alias}.user_id IS NULL OR EXISTS (SELECT 1 FROM payments p WHERE p.id = ${alias}.payment_id
    AND p.user_id = ${alias}.user_id AND p.status = 'completed' AND p.amount = ${alias}.amount
    AND p.currency = 'SAR' AND LOWER(p.provider) NOT IN ('mock', 'stub', '')
    AND p.provider_transaction_id IS NOT NULL AND p.paid_at IS NOT NULL
    AND p.metadata->>'ad_id' = ${alias}.id::text))`;
}

// Note: when columns added by later migrations don't exist yet on a
// given DB, the corresponding NULL alias keeps the field consistent
// in the API response.
const SELECT = `
  a.*,
  u.full_name AS user_name, u.avatar AS user_avatar,
  approver.full_name AS approver_name
`;

const FROM = `
  FROM ads a
  LEFT JOIN users u        ON a.user_id = u.id
  LEFT JOIN users approver ON a.approved_by = approver.id
`;

function parseRow(row) {
  if (!row) return null;
  for (const col of ['placements', 'target_countries', 'target_cities', 'target_regions']) {
    if (row[col] && typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch (_) { row[col] = null; }
    }
  }
  return row;
}

async function findById(id) {
  const row = await queryOne(`SELECT ${SELECT} ${FROM} WHERE a.id = ?`, [id]);
  return parseRow(row);
}

async function listForUser(userId) {
  const rows = await query(
    `SELECT ${SELECT} ${FROM} WHERE a.user_id = ? ORDER BY a.created_at DESC`,
    [userId]
  );
  return rows.map(parseRow);
}

async function listPaginated({ status, placement, mine, page = 1, limit = 20 } = {}) {
  ({ page, limit } = pagination(page, limit));
  const offset = (Number(page) - 1) * Number(limit);
  const where = ['1=1'];
  const params = [];
  if (status)    { where.push('a.status = ?');    params.push(status); }
  if (placement) {
    where.push('(a.placement = ? OR jsonb_exists(a.placements, ?))');
    params.push(placement, placement);
  }
  if (mine)      { where.push('a.user_id = ?');   params.push(mine); }
  const whereSql = where.join(' AND ');
  const items = await query(
    `SELECT ${SELECT} ${FROM} WHERE ${whereSql}
     ORDER BY a.sort_order ASC, a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM ads a WHERE ${whereSql}`,
    params
  );
  return { items: items.map(parseRow), total };
}

// Ads currently servable to visitors at a given placement — active,
// within window, under view cap, marked enabled.
async function listLive({ placement, applyExclusivity = true } = {}) {
  const params = [];
  let where = `
    a.status = 'active' AND a.is_active = 1
    AND (a.starts_at IS NULL OR a.starts_at <= CURRENT_TIMESTAMP)
    AND (a.ends_at   IS NULL OR a.ends_at   >  CURRENT_TIMESTAMP)
    AND (a.max_views IS NULL OR a.views_count < a.max_views)
    AND ${paymentGuard('a')}
  `;
  if (placement) {
    // Migration 016 stores a JSONB string array. Exact membership also
    // keeps legacy rows with NULL placements working through placement.
    where += ` AND (a.placement = ? OR jsonb_exists(a.placements, ?))`;
    params.push(placement, placement);
  }
  const rows = await query(
    `SELECT a.id, a.title, a.description, a.image, a.media_type, a.link, a.placement, a.placements,
       a.exclusive, a.target_countries, a.target_cities, a.target_regions, a.starts_at, a.ends_at
       FROM ads a WHERE ${where} ORDER BY a.sort_order ASC, RAND()`,
    params
  );
  const parsed = rows.map(parseRow);
  // If any exclusive ad is live at this placement, it takes over —
  // shared ads stand aside. Multiple exclusives at the same spot
  // rotate among themselves.
  const exclusives = parsed.filter((r) => r.exclusive);
  return applyExclusivity && exclusives.length ? exclusives : parsed;
}

async function create(data) {
  // Build the INSERT dynamically so columns introduced by later
  // migrations (status, placements, exclusive, max_views, …) are
  // included only when they exist on this DB.
  const candidate = [
    ['title',         data.title],
    ['description',   data.description || null],
    ['image',         data.image || null],
    ['media_type',    data.media_type === 'video' ? 'video' : 'image'],
    ['link',          data.link || null],
    ['placement',     data.placement || 'home_top'],
    ['is_active',     data.is_active ? 1 : 0],
    ['sort_order',    data.sort_order || 0],
    ['starts_at',     data.starts_at || null],
    ['ends_at',       data.ends_at   || null],
    // Migration 016 columns
    ['user_id',       data.user_id || null],
    ['status',        data.status || 'requested'],
    ['placements',    data.placements ? JSON.stringify(data.placements) : null],
    ['max_views',     data.max_views     || null],
    ['duration_days', data.duration_days || null],
    ['amount',        data.amount || 0],
    ['notes',         data.notes  || null],
    // Migration 019 column
    ['exclusive',     data.exclusive ? 1 : 0],
    // Migration 020 columns
    ['target_countries', data.target_countries ? JSON.stringify(data.target_countries) : null],
    ['target_cities',    data.target_cities    ? JSON.stringify(data.target_cities)    : null],
    // Migration 021 column
    ['target_regions',   data.target_regions   ? JSON.stringify(data.target_regions)   : null],
  ];
  const cols = [];
  const values = [];
  for (const [col, val] of candidate) {
    if (await tableHasColumn('ads', col)) {
      cols.push(col);
      values.push(val);
    }
  }
  const placeholders = cols.map(() => '?').join(', ');
  const result = await query(
    `INSERT INTO ads (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return findById(result.insertId);
}

async function update(id, data) {
  const current = await findById(id);
  if (current?.user_id && ['status', 'is_active', 'starts_at', 'ends_at', 'max_views', 'duration_days', 'placement', 'placements'].some(k => data[k] !== undefined)) throw invalid('Use the advertisement approval and payment workflow', 409);
  const allowed = [
    'title', 'description', 'image', 'media_type', 'link',
    'placement', 'is_active', 'status',
    'starts_at', 'ends_at', 'max_views', 'duration_days',
    'sort_order',
  ];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (data.placements !== undefined) {
    fields.push('placements = ?');
    values.push(data.placements ? JSON.stringify(data.placements) : null);
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await query(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function approve(id, adminId) {
  const result = await query(
    `UPDATE ads SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
                   rejected_at = NULL, rejection_reason = NULL
     WHERE id = ? AND status = 'requested'`,
    [adminId, id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function reject(id, adminId, reason) {
  if (reason != null && (typeof reason !== 'string' || reason.length > 10000)) throw invalid('Invalid rejection reason');
  const result = await query(
    `UPDATE ads SET status = 'rejected', approved_by = ?, rejected_at = CURRENT_TIMESTAMP,
                   rejection_reason = ?
     WHERE id = ? AND status IN ('requested', 'approved', 'awaiting_payment')`,
    [adminId, reason || null, id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function activate(id, { paymentId } = {}) {
  // Preserve the purchased bounds. Only verified, paid requests activate.
  const result = await query(
    `UPDATE ads
       SET status = 'active', is_active = 1,
           paid_at = COALESCE(paid_at, CASE WHEN ?::integer IS NULL THEN paid_at ELSE CURRENT_TIMESTAMP END),
           payment_id = COALESCE(?, payment_id),
           activated_at = CURRENT_TIMESTAMP,
           starts_at = COALESCE(starts_at, CURRENT_TIMESTAMP),
           ends_at = COALESCE(ends_at,
                              CASE WHEN duration_days IS NOT NULL
                                   THEN COALESCE(starts_at, CURRENT_TIMESTAMP) + duration_days * INTERVAL '1 day'
                                   ELSE NULL END)
     WHERE id = ? AND status = 'awaiting_payment' AND ${paymentGuard().replace('ads.payment_id', '?')}
       AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
       AND (max_views IS NULL OR views_count < max_views)`,
    [paymentId || null, paymentId || null, id, paymentId || null]
  );
  return result.affectedRows ? findById(id) : null;
}

async function markAwaitingPayment(id) {
  await query("UPDATE ads SET status = 'awaiting_payment' WHERE id = ? AND status = 'approved'", [id]);
  return findById(id);
}

async function cancel(id) {
  const result = await query("UPDATE ads SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ? AND status IN ('requested', 'approved', 'awaiting_payment')", [id]);
  return result.affectedRows ? findById(id) : null;
}

async function remove(id) {
  await query('DELETE FROM ads WHERE id = ?', [id]);
}

async function bumpViews(id) {
  return transaction(async conn => {
  const [result] = await conn.execute(`UPDATE ads SET views_count = views_count + 1 WHERE id = ? AND status = 'active' AND is_active = 1
    AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
    AND (max_views IS NULL OR views_count < max_views) AND views_count < 2147483647 AND ${paymentGuard()}`, [id]);
  if (!result.affectedRows) return false;
  await conn.execute(
    `INSERT INTO ad_stats_daily (ad_id, day, views_count, clicks_count)
     VALUES (?, CURRENT_DATE, 1, 0)
     ON CONFLICT (ad_id, day) DO UPDATE SET views_count = ad_stats_daily.views_count + 1`,
    [id]
  );
  return true;
  });
}

async function bumpClicks(id) {
  return transaction(async conn => {
  const [result] = await conn.execute(`UPDATE ads SET clicks_count = clicks_count + 1 WHERE id = ? AND status = 'active' AND is_active = 1
    AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
    AND (max_views IS NULL OR views_count < max_views) AND clicks_count < 2147483647 AND ${paymentGuard()}`, [id]);
  if (!result.affectedRows) return null;
  await conn.execute(
    `INSERT INTO ad_stats_daily (ad_id, day, views_count, clicks_count)
     VALUES (?, CURRENT_DATE, 0, 1)
     ON CONFLICT (ad_id, day) DO UPDATE SET clicks_count = ad_stats_daily.clicks_count + 1`,
    [id]
  );
  const [rows] = await conn.execute('SELECT link FROM ads WHERE id = ?', [id]);
  return rows[0];
  });
}

// Last `days` of daily stats for one ad, filled forward so missing
// days return zero rows — easier to chart.
async function dailyStats(adId, days = 14) {
  if (!Number.isSafeInteger(Number(days)) || Number(days) < 1 || Number(days) > 60) throw invalid('Invalid statistics window');
  days = Number(days);
  const rows = await query(
    `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, views_count, clicks_count
       FROM ad_stats_daily
      WHERE ad_id = ?
        AND day >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      ORDER BY day ASC`,
    [adId, days]
  );
  const map = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) || { day: key, views_count: 0, clicks_count: 0 });
  }
  return out;
}

async function pause(id) {
  const result = await query("UPDATE ads SET status = 'paused', is_active = 0 WHERE id = ? AND status = 'active'", [id]);
  return result.affectedRows ? findById(id) : null;
}

async function resume(id) {
  // Resume only flips back to active if the schedule + view-cap still allow it.
  const result = await query(
    `UPDATE ads SET status = 'active', is_active = 1
      WHERE id = ? AND status = 'paused'
        AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
        AND (max_views IS NULL OR views_count < max_views) AND ${paymentGuard()}`,
    [id]
  );
  return result.affectedRows ? findById(id) : null;
}

// Lazy sweep — flip ads to 'expired' once they pass ends_at or hit
// their view cap. Called from list endpoints so it stays current
// without a cron.
async function expireOverdue() {
  await query(
    `UPDATE ads SET status = 'expired', is_active = 0
      WHERE status IN ('active', 'paused')
        AND ((ends_at IS NOT NULL AND ends_at <= CURRENT_TIMESTAMP)
          OR (max_views IS NOT NULL AND views_count >= max_views) OR NOT ${paymentGuard()})`
  );
}

module.exports = {
  findById, listForUser, listPaginated, listLive,
  create, update,
  approve, reject, activate, markAwaitingPayment, cancel, remove,
  bumpViews, bumpClicks, dailyStats, pause, resume, expireOverdue,
};
