const { query, queryOne, transaction, tableHasColumn } = require('../config/database');
const { canManageAdmin } = require('../middleware/roleCheck');
const Setting = require('../models/Setting');
const Request = require('../models/Request');
const Subscription = require('../models/Subscription');
const Review = require('../models/Review');
const ConversationArchive = require('../models/ConversationArchive');
const notificationService = require('../services/notificationService');
const { runMigrationsFromEnv } = require('../services/installService');
const { success, created, error, notFound, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const AdMedia = require('../models/AdMedia');
const { ALLOWED_FILE_TYPES } = require('../config/constants');
const User = require('../models/User');
const { hasPermission } = require('../middleware/roleCheck');
const { ApiError } = require('../middleware/errorHandler');
const { ALLOWED_PLACEMENTS } = require('../services/adRequestService');

function validAdInput(data, creating = false) {
  if ((creating && (typeof data.title !== 'string' || !data.title.trim())) || (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 200))) return false;
  if (data.description !== undefined && data.description !== null && (typeof data.description !== 'string' || data.description.length > 10000)) return false;
  for (const field of ['image', 'link']) {
    const value = data[field];
    if (value !== undefined && value !== null && value !== '' && (typeof value !== 'string' || value.length > 255 || !/^(?:https?:\/\/|\/(?!\/))/i.test(value) || /[\u0000-\u0020]/.test(value))) return false;
  }
  if (data.media_type !== undefined && !['image', 'video'].includes(data.media_type)) return false;
  if (data.placement !== undefined && !ALLOWED_PLACEMENTS.includes(data.placement)) return false;
  if (data.placements !== undefined && (!Array.isArray(data.placements) || !data.placements.length || data.placements.length > ALLOWED_PLACEMENTS.length || data.placements.some(value => !ALLOWED_PLACEMENTS.includes(value)))) return false;
  for (const field of ['exclusive', 'is_active']) if (data[field] !== undefined && ![true, false, 0, 1].includes(data[field])) return false;
  for (const field of ['max_views', 'sort_order']) if (data[field] !== undefined && data[field] !== null && (!['number', 'string'].includes(typeof data[field]) || !Number.isSafeInteger(Number(data[field])) || Number(data[field]) < 0 || Number(data[field]) > 2147483647)) return false;
  for (const field of ['starts_at', 'ends_at']) if (data[field] !== undefined && data[field] !== null && data[field] !== '' && (typeof data[field] !== 'string' || !Number.isFinite(Date.parse(data[field])))) return false;
  if (data.starts_at && data.ends_at && Date.parse(data.ends_at) <= Date.parse(data.starts_at)) return false;
  for (const field of ['target_countries', 'target_cities', 'target_regions']) if (data[field] !== undefined && data[field] !== null && (!Array.isArray(data[field]) || data[field].length > 500 || data[field].some(value => field === 'target_regions' ? !Number.isSafeInteger(Number(value)) || Number(value) <= 0 : typeof value !== 'string' || value.length > 120))) return false;
  return true;
}

const dashboard = asyncHandler(async (req, res) => {
  // Fetch every counter in parallel — cuts dashboard load from ~150 round
  // trips to one wave of ~20.
  const safeCount = async (sql, params = []) => {
    try { const [r] = await query(sql, params); return Number(r?.total || 0); }
    catch (_) { return 0; }
  };

  const [
    users, providers, clients,
    requests, activeRequests, completedRequests, urgentRequests,
    revenue, activeSubs, pendingVerifications,
    conversations, activeConversations, messages, voiceMessages,
    liveLocations, totalLocations,
    disputes, openDisputes,
    testUsers,
  ] = await Promise.all([
    safeCount("SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM users WHERE role = 'provider' AND deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM users WHERE role = 'client' AND deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM requests WHERE deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM requests WHERE status IN ('open','assigned','in_progress') AND deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM requests WHERE status = 'completed'"),
    safeCount("SELECT COUNT(*) AS total FROM requests WHERE is_urgent = 1 AND status IN ('open','assigned') AND deleted_at IS NULL"),
    safeCount("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'completed' AND LOWER(provider) NOT IN ('mock','stub','') AND provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL"),
    safeCount(`SELECT COUNT(*) AS total FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE ${Subscription.validEntitlementSql('s', 'p')}`),
    safeCount("SELECT COUNT(*) AS total FROM verification_requests WHERE status = 'pending'"),
    safeCount("SELECT COUNT(*) AS total FROM conversations"),
    safeCount("SELECT COUNT(*) AS total FROM conversations WHERE last_message_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
    safeCount("SELECT COUNT(*) AS total FROM messages WHERE deleted_at IS NULL"),
    safeCount("SELECT COUNT(*) AS total FROM messages WHERE message_type = 'voice' AND deleted_at IS NULL"),
    safeCount("SELECT COUNT(DISTINCT user_id) AS total FROM location_shares WHERE is_live = 1 AND (expires_at IS NULL OR expires_at > NOW())"),
    safeCount("SELECT COUNT(*) AS total FROM location_shares"),
    safeCount("SELECT COUNT(*) AS total FROM disputes"),
    safeCount("SELECT COUNT(*) AS total FROM disputes WHERE status IN ('open','under_review','waiting_response','escalated')"),
    safeCount("SELECT COUNT(*) AS total FROM users WHERE email LIKE '%@ayk-test.local'"),
  ]);

  // Lists & breakdowns — these can fail individually without breaking
  // the page (caught & defaulted to []).
  let recentUsers = [], recentRequests = [], requestsByStatus = [];
  if (hasPermission(req.user, 'users.manage')) try {
    recentUsers = await query(
      `SELECT id, full_name, email, role, avatar, created_at FROM users
       WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`
    );
  } catch (_) {}
  if (hasPermission(req.user, 'requests.manage')) try {
    recentRequests = await query(
      `SELECT r.id, r.title, r.status, r.is_urgent, r.created_at, u.full_name AS client_name
       FROM requests r LEFT JOIN users u ON r.client_id = u.id
       WHERE r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 10`
    );
  } catch (_) {}
  try {
    requestsByStatus = await query(
      `SELECT status, COUNT(*) AS total FROM requests WHERE deleted_at IS NULL GROUP BY status`
    );
  } catch (_) {}

  const stats = {
      users, providers, clients,
      requests, active_requests: activeRequests, completed_requests: completedRequests,
      urgent_requests: urgentRequests,
      revenue, active_subscriptions: activeSubs, pending_verifications: pendingVerifications,
      conversations, active_conversations: activeConversations,
      messages, voice_messages: voiceMessages,
      live_locations: liveLocations, total_locations: totalLocations,
      disputes, open_disputes: openDisputes,
      test_users: testUsers,
  };
  // Translation this month: characters sent to Microsoft against the free quota, and what
  // the translation memory answered for free (AYK-121).
  let translation = null;
  if (hasPermission(req.user, 'settings.manage')) {
    try { translation = await require('../services/translationMemory').summary(); } catch (_) {}
  }
  if (!hasPermission(req.user, 'conversations.read')) {
    for (const key of ['conversations', 'active_conversations', 'messages', 'voice_messages', 'live_locations', 'total_locations']) delete stats[key];
  }
  if (!hasPermission(req.user, 'disputes.manage')) {
    delete stats.disputes; delete stats.open_disputes;
  }
  return success(res, {
    stats,
    recent_users: recentUsers,
    recent_requests: recentRequests,
    requests_by_status: requestsByStatus,
    translation,
  });
});

const listAllRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search, region_id, city_id, category_id, visibility } = req.query;
  const { items, total } = await Request.listAll({ page, limit, status, search, region_id, city_id, category_id, visibility });
  return paginate(res, items, total, page, limit);
});

// AYK-361: service providers for the administration: newest first, by region, city, profession and
// shown/hidden, with a search over the name, number, phone and business name.
const listProvidersAdmin = asyncHandler(async (req, res) => {
  const { page, limit } = Request.pagination(req.query.page, req.query.limit);
  const id = value => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null; };
  const where = ["u.role = 'provider'", 'u.deleted_at IS NULL'];
  const params = [];
  if (id(req.query.region_id)) { where.push('c.region_id = ?'); params.push(id(req.query.region_id)); }
  if (id(req.query.city_id)) { where.push('u.city_id = ?'); params.push(id(req.query.city_id)); }
  if (id(req.query.category_id)) {
    where.push(`(pp.category_id = ? OR EXISTS (SELECT 1 FROM services sv WHERE sv.category_id = ? AND pp.service_ids @> to_jsonb(sv.id)))`);
    params.push(id(req.query.category_id), id(req.query.category_id));
  }
  if (req.query.visibility === 'hidden') where.push('pp.hidden_at IS NOT NULL');
  else if (req.query.visibility === 'shown') where.push('pp.hidden_at IS NULL');
  const text = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (text) {
    const like = `%${text}%`;
    where.push('(u.full_name ILIKE ? OR pp.business_name ILIKE ? OR u.phone LIKE ? OR u.referral_code = ? OR u.username ILIKE ?)');
    params.push(like, like, like, text, like);
  }
  const from = `FROM users u JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN cities c ON c.id = u.city_id LEFT JOIN regions rg ON rg.id = c.region_id
    LEFT JOIN districts d ON d.id = u.district_id LEFT JOIN categories cat ON cat.id = pp.category_id
    WHERE ${where.join(' AND ')}`;
  const items = await query(`SELECT u.id, u.full_name, u.username, u.phone, u.referral_code, u.is_active, u.is_blocked, u.also_client,
      u.created_at, u.last_seen_at, pp.business_name, pp.rating_avg, pp.rating_count, pp.completed_orders, pp.hidden_at,
      pp.category_id, cat.name_ar AS category_name, c.name_ar AS city_name, rg.name_ar AS region_name, d.name_ar AS district_name,
      u.is_online, pp.availability_status, pp.vacation_from, pp.vacation_to, pp.work_days, pp.work_from, pp.work_to, pp.work_schedule,
      ${COVERAGE_SQL}
    ${from} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  // AYK-366: available (by their schedule) and present (app open) apart, and where they work.
  for (const row of items) {
    row.availability = availability(row);
    row.coverage = coverageOf(row);
    for (const key of ['availability_status', 'vacation_from', 'vacation_to', 'work_days', 'work_from', 'work_to', 'work_schedule',
      'coverage_city', 'coverage_districts_count', 'coverage_districts_list']) delete row[key];
  }
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${from}`, params);
  return paginate(res, items, total, page, limit);
});

// AYK-361: hide a provider from the lists people see, or show them again. The account still works.
const hideProvider = asyncHandler(async (req, res) => {
  const providerId = Number(req.params.id);
  if (!Number.isSafeInteger(providerId) || providerId < 1 || ![true, false].includes(req.body?.hidden)) return error(res, req.t('invalid_data'), 400);
  const found = await queryOne(`SELECT pp.user_id FROM provider_profiles pp JOIN users u ON u.id = pp.user_id
    WHERE pp.user_id = ? AND u.deleted_at IS NULL`, [providerId]);
  if (!found) return notFound(res);
  await query(`UPDATE provider_profiles SET hidden_at = ${req.body.hidden ? 'COALESCE(hidden_at, CURRENT_TIMESTAMP)' : 'NULL'} WHERE user_id = ?`, [providerId]);
  const rows = [await queryOne('SELECT hidden_at FROM provider_profiles WHERE user_id = ?', [providerId])];
  await query(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?, ?, 'user', ?, ?)`,
    [req.user.id, req.body.hidden ? 'admin.provider.hide' : 'admin.provider.show', providerId, null]).catch(() => {});
  return success(res, { id: providerId, hidden: !!rows[0].hidden_at });
});

// AYK-361: hide a request from providers or show it again.
const hideRequest = asyncHandler(async (req, res) => {
  if (![true, false].includes(req.body?.hidden)) return error(res, req.t('invalid_data'), 400);
  const row = await Request.setHidden(req.params.id, req.body.hidden);
  if (!row) return notFound(res);
  await query(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?, ?, 'request', ?, ?)`,
    [req.user.id, req.body.hidden ? 'admin.request.hide' : 'admin.request.show', row.id, null]).catch(() => {});
  return success(res, { id: row.id, hidden: !!row.hidden_at });
});

const getSettings = asyncHandler(async (req, res) => {
  const items = await Setting.getAll();
  return success(res, items);
});

const updateSettings = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body.items) || req.body.items.length > 200 || req.body.items.some(item =>
    !item || typeof item !== 'object' || Array.isArray(item) || typeof item.key !== 'string' || !item.key || item.key.length > 100 || item.value === undefined || JSON.stringify(item.value).length > 20000
  )) return error(res, req.t('invalid_data'), 400);
  const items = req.body.items.map(({ key, value }) => ({ key, value }));
  await Setting.updateMany(items);
  const updated = await Setting.getAll();
  return success(res, updated, req.t('settings_updated'));
});

const listVerifications = asyncHandler(async (req, res) => {
  const { status = 'pending', page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const items = await query(
    `SELECT v.*, u.full_name, u.email, u.phone FROM verification_requests v
     JOIN users u ON v.user_id = u.id
     WHERE v.status = ? ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
    [status, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM verification_requests WHERE status = ?',
    [status]
  );
  return paginate(res, items, total, page, limit);
});

const reviewVerification = asyncHandler(async (req, res) => {
  const { action, rejection_reason } = req.body;
  if (!['approve', 'reject'].includes(action) || (rejection_reason !== undefined && (typeof rejection_reason !== 'string' || rejection_reason.length > 2000))) return error(res, req.t('invalid_data'), 400);
  const verification = await queryOne('SELECT id, user_id FROM verification_requests WHERE id = ?', [req.params.id]);
  if (!verification) return notFound(res);
  const status = action === 'approve' ? 'approved' : 'rejected';
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [verification.user_id]);
    const [rows] = await conn.execute('SELECT id, status FROM verification_requests WHERE id = ? FOR UPDATE', [verification.id]);
    if (!rows.length) throw new ApiError('Verification not found', 404);
    if (rows[0].status !== 'pending') throw new ApiError('Verification already reviewed', 409);
    await conn.execute(`UPDATE verification_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = ? WHERE id = ?`, [status, req.user.id, rejection_reason || null, verification.id]);
    await conn.execute(`UPDATE users SET is_verified = CASE
      WHEN EXISTS (SELECT 1 FROM verification_requests vr WHERE vr.user_id = users.id AND vr.status = 'approved')
        OR EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = users.id AND uv.status = 'verified' AND (uv.expires_at IS NULL OR uv.expires_at > CURRENT_TIMESTAMP)) THEN 1 ELSE 0 END WHERE id = ?`, [verification.user_id]);
    const [approved] = await conn.execute("SELECT id FROM verification_requests WHERE user_id = ? AND status = 'approved' LIMIT 1", [verification.user_id]);
    await conn.execute('UPDATE provider_profiles SET verification_status = ?, verified_at = ? WHERE user_id = ?', [approved.length ? 'verified' : 'rejected', approved.length ? new Date() : null, verification.user_id]);
  });
  return success(res, null, req.t('verification_updated'));
});

const listAds = asyncHandler(async (req, res) => {
  const items = await query('SELECT * FROM ads ORDER BY sort_order ASC, created_at DESC');
  return success(res, items);
});

const createAd = asyncHandler(async (req, res) => {
  if (!validAdInput(req.body, true)) return error(res, req.t('invalid_data'), 400);
  // Admin-direct ads bypass the request workflow — status='active'
  // immediately so they show up on the public placements without
  // anyone needing to approve them.
  const { title, description, image, media_type, link, placement, placements,
          starts_at, ends_at, max_views, sort_order, exclusive } = req.body;

  // Optional-column shims — every column added by a later migration
  // is conditionally included so creates still succeed even if the
  // host hasn't applied 016/019/020 yet.
  const cols = ['title', 'description', 'image', 'media_type', 'link',
                'placement', 'placements', 'status', 'is_active'];
  const values = [title, description || null, image || null,
                  media_type === 'video' ? 'video' : 'image',
                  link || null, placement || 'home_top',
                  placements ? JSON.stringify(placements) : null,
                  'active', 1];
  const optional = [
    ['exclusive', exclusive ? 1 : 0],
    ['starts_at', starts_at || null],
    ['ends_at',   ends_at   || null],
    ['max_views', max_views || null],
    ['sort_order', sort_order || 0],
    ['target_countries', req.body.target_countries ? JSON.stringify(req.body.target_countries) : null],
    ['target_cities',    req.body.target_cities    ? JSON.stringify(req.body.target_cities)    : null],
    ['target_regions',   req.body.target_regions   ? JSON.stringify(req.body.target_regions)   : null],
  ];
  for (const [col, val] of optional) {
    if (await tableHasColumn('ads', col)) {
      cols.push(col);
      values.push(val);
    }
  }
  const placeholders = cols.map(() => '?').join(', ');
  const inserted = await query(
    `INSERT INTO ads (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  // AYK-343: the ad's title and text in the 11 languages.
  require('../services/contentTranslation').later('ads', inserted?.insertId);
  return success(res, null, req.t('ad_created'));
});

const updateAd = asyncHandler(async (req, res) => {
  if (!validAdInput(req.body)) return error(res, req.t('invalid_data'), 400);
  const ad = await queryOne('SELECT * FROM ads WHERE id = ?', [req.params.id]);
  if (!ad) return notFound(res);
  // Purchased campaigns use payment-checked lifecycle actions. Generic CRUD
  // may edit their content but cannot grant unbilled visibility or duration,
  // unless the administration waived the ad's fees (AYK-153). The refusal says why (AYK-155).
  const waived = Number(ad.fee_waived) === 1;
  if (ad.user_id && !waived && ['placement', 'placements', 'is_active', 'status', 'exclusive', 'starts_at', 'ends_at', 'max_views', 'target_countries', 'target_cities', 'target_regions'].some(key => req.body[key] !== undefined)) return error(res, req.t('ad_paid_bounds_locked'), 403);
  const allowed = ['title', 'description', 'image', 'media_type', 'link',
                   'placement', 'is_active', 'status', 'exclusive',
                   'starts_at', 'ends_at', 'max_views', 'sort_order'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    // Skip columns that don't exist yet on this host.
    if (!(await tableHasColumn('ads', k))) continue;
    fields.push(`${k} = ?`);
    values.push(req.body[k]);
  }
  // JSON columns — serialize when present + present in schema.
  for (const json of ['placements', 'target_countries', 'target_cities', 'target_regions']) {
    if (req.body[json] !== undefined && await tableHasColumn('ads', json)) {
      fields.push(`${json} = ?`);
      values.push(req.body[json] ? JSON.stringify(req.body[json]) : null);
    }
  }
  if (!fields.length) return success(res, null, req.t('no_updates'));
  values.push(req.params.id);
  await query(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`, values);
  require('../services/contentTranslation').later('ads', req.params.id); // AYK-343
  return success(res, null, req.t('updated'));
});

const uploadAdMedia = asyncHandler(async (req, res) => {
  const f = req.file;
  if (!f || !f.buffer) return error(res, req.t('invalid_data'), 400);
  // multer.memoryStorage gives us the file as f.buffer — write it to
  // the ad_media table so the bytes survive on read-only filesystems
  // and in containers. The serving URL goes through /api/ads/media/:id.
  const id = await AdMedia.create({
    mime: f.mimetype, size: f.size, filename: f.originalname, buffer: f.buffer,
  });
  const media_type = ALLOWED_FILE_TYPES.VIDEO.includes(f.mimetype) ? 'video' : 'image';
  return success(res, {
    url: `/api/ads/media/${id}`,
    media_type,
    mime: f.mimetype,
    size: f.size,
  });
});

const deleteAd = asyncHandler(async (req, res) => {
  await query('DELETE FROM ads WHERE id = ?', [req.params.id]);
  return success(res, null, req.t('deleted'));
});

const activityLogs = asyncHandler(async (req, res) => {
  // AYK-240: bounded paging and an optional action filter (e.g. ?action=login_failed).
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const action = typeof req.query.action === 'string' && /^[a-z_]{1,100}$/.test(req.query.action) ? req.query.action : null;
  const where = action ? 'WHERE al.action = ?' : '';
  const params = action ? [action] : [];
  const items = await query(
    `SELECT al.*, u.full_name FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM activity_logs al ${where}`, params);
  return paginate(res, items, total, page, limit);
});

// ─── Security report (AYK-242) ──────────────────────────────────────────
// Attempts against the server (SSH, from the export timer) and the site (sign-in failures,
// lockouts, rate limits, admin sign-ins), with time, address, country and status.
const SITE_EVENTS = { login_failed: 'failed', login_locked: 'blocked', login_while_locked: 'blocked', rate_limited: 'blocked', admin_login: 'success' };
const SERVER_STATUS = { ssh_failed: 'failed', ssh_banned: 'blocked', http_flood: 'blocked', flood_banned: 'blocked', repeat_banned: 'blocked' };

const tableExists = async name => Boolean(await queryOne(
  "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?", [name]));

const DAY = 86400000;
const dayKey = d => new Date(d).toISOString().slice(0, 10);
// A DATE column may arrive as a local-midnight Date or as text.
const dateKey = v => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  : String(v).slice(0, 10));

// Period: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, at most 90 days) or ?days=1|7|30|90.
function reportRange(q) {
  const valid = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  if (valid(q.from) && valid(q.to) && q.from <= q.to) {
    const since = new Date(`${q.from}T00:00:00Z`);
    const until = new Date(Math.min(Date.parse(`${q.to}T00:00:00Z`) + DAY, since.getTime() + 90 * DAY));
    return { since, until, days: Math.round((until - since) / DAY) };
  }
  const days = [1, 7, 30, 90].includes(Number(q.days)) ? Number(q.days) : 7;
  // "Today" starts at midnight Saudi time (UTC+3), so its totals only grow during the day.
  if (days === 1) {
    const RIYADH = 3 * 3600000;
    const since = new Date(Math.floor((Date.now() + RIYADH) / DAY) * DAY - RIYADH);
    return { since, until: new Date(Date.now() + 60000), days: 1 };
  }
  return { since: new Date(Date.now() - days * DAY), until: new Date(Date.now() + 60000), days };
}

const securityReport = asyncHandler(async (req, res) => {
  const { since, until, days } = reportRange(req.query);
  const source = ['server', 'site'].includes(req.query.source) ? req.query.source : 'all';
  const hasTable = await tableExists('security_events');
  const useServer = source !== 'site' && hasTable;
  const useSite = source !== 'server';
  const siteKeys = Object.keys(SITE_EVENTS);
  const siteIn = siteKeys.map(() => '?').join(', ');

  // Totals per event and day, straight from the database (not from a sample of rows).
  const serverDaily = useServer ? await query(
    `SELECT event, date(last_at) AS d, SUM(attempts) AS n FROM security_events
     WHERE last_at >= ? AND last_at < ? GROUP BY event, date(last_at)`, [since, until]) : [];
  const siteDaily = useSite ? await query(
    `SELECT action AS event, date(created_at) AS d, COUNT(*) AS n FROM activity_logs
     WHERE action IN (${siteIn}) AND created_at >= ? AND created_at < ? GROUP BY action, date(created_at)`,
    [...siteKeys, since, until]) : [];
  const statusOf = e => SERVER_STATUS[e] || SITE_EVENTS[e];
  const totals = {};
  const daily = {};
  for (let t = since.getTime(); t < until.getTime(); t += DAY) daily[dayKey(t)] = { failed: 0, blocked: 0, success: 0 };
  for (const r of [...serverDaily, ...siteDaily]) {
    const n = Number(r.n) || 0;
    totals[r.event] = (totals[r.event] || 0) + n;
    const k = dateKey(r.d);
    daily[k] = daily[k] || { failed: 0, blocked: 0, success: 0 };
    daily[k][statusOf(r.event)] += n;
  }

  // Attempts per address (successful admin sign-ins are not attacks).
  const perIp = {};
  const addIps = rows => { for (const r of rows) if (r.ip) perIp[r.ip] = (perIp[r.ip] || 0) + Number(r.n); };
  if (useServer) addIps(await query(`SELECT ip, SUM(attempts) AS n FROM security_events WHERE last_at >= ? AND last_at < ? GROUP BY ip`, [since, until]));
  if (useSite) addIps(await query(`SELECT ip_address AS ip, COUNT(*) AS n FROM activity_logs
    WHERE action IN (${siteIn}) AND action <> 'admin_login' AND created_at >= ? AND created_at < ? GROUP BY ip_address`, [...siteKeys, since, until]));

  // The latest events, for the table.
  const server = useServer ? await query(
    `SELECT event, ip, attempts, detail, first_at, last_at FROM security_events
     WHERE last_at >= ? AND last_at < ? ORDER BY last_at DESC LIMIT 300`, [since, until]) : [];
  const site = useSite ? await query(
    `SELECT al.action, al.ip_address, al.description, al.created_at, u.username
     FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
     WHERE al.action IN (${siteIn}) AND al.created_at >= ? AND al.created_at < ?
     ORDER BY al.created_at DESC LIMIT 300`, [...siteKeys, since, until]) : [];
  const events = [
    ...server.map(r => ({ source: 'server', event: r.event, status: SERVER_STATUS[r.event] || 'failed', ip: r.ip,
      attempts: Number(r.attempts) || 1, detail: r.detail || null, at: r.last_at, first_at: r.first_at })),
    ...site.map(r => ({ source: 'site', event: r.action, status: SITE_EVENTS[r.action], ip: r.ip_address || null,
      attempts: 1, detail: r.username || r.description || null, at: r.created_at })),
  ].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 300);

  const countryOf = await require('../services/geoip').countries([...Object.keys(perIp), ...events.map(e => e.ip)].filter(Boolean));
  for (const e of events) e.country = countryOf[e.ip] || null;
  const byCountry = {};
  for (const [ip, n] of Object.entries(perIp)) { const c = countryOf[ip] || '??'; byCountry[c] = (byCountry[c] || 0) + n; }
  const attempts = Object.values(perIp).reduce((a, n) => a + n, 0);
  const sum = keys => keys.reduce((a, k) => a + (totals[k] || 0), 0);

  return success(res, {
    range: { from: dayKey(since), to: dayKey(until - 1), days }, source, server_feed: hasTable,
    server_last_at: hasTable ? (await queryOne('SELECT MAX(created_at) AS t FROM security_events'))?.t || null : null,
    summary: {
      attempts, attackers: Object.keys(perIp).length, countries: Object.keys(byCountry).filter(c => c !== '??').length,
      ssh_failed: sum(['ssh_failed']), ssh_banned: sum(['ssh_banned']),
      site_failed: sum(['login_failed']), locked: sum(['login_locked', 'login_while_locked']),
      rate_limited: sum(['rate_limited']), admin_logins: sum(['admin_login']),
      blocked: sum(['ssh_banned', 'login_locked', 'login_while_locked', 'rate_limited', 'flood_banned', 'repeat_banned']),
      http_flood: sum(['http_flood']), flood_banned: sum(['flood_banned', 'repeat_banned']),
      per_day: Math.round(attempts / Math.max(1, days)),
    },
    daily: Object.entries(daily).sort(([x], [y]) => (x < y ? -1 : 1)).map(([date, v]) => ({ date, ...v })),
    countries: Object.entries(byCountry).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([code, n]) => ({ code, attempts: n })),
    top_ips: Object.entries(perIp).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([ip, n]) => ({ ip, attempts: n, country: countryOf[ip] || null })),
    events,
    attribution: 'IP Geolocation by DB-IP',
  });
});

// --- Admin request actions ---
const updateRequest = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res, req.t('request_not_found'));

  const validated = await Request.validateInput({ ...request, ...req.body, client_id: request.client_id });

  const allowed = ['title', 'description', 'category_id', 'service_id', 'city_id',
                   'district_id', 'address', 'budget_min', 'budget_max',
                   'preferred_date', 'is_urgent'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(validated[k]);
    }
  }
  if (!fields.length) return success(res, request, req.t('no_updates'));
  values.push(req.params.id);
  await query(`UPDATE requests SET ${fields.join(', ')} WHERE id = ?`, values);
  const updated = await Request.findById(req.params.id);
  return success(res, updated, req.t('updated'));
});

const assignRequest = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res, req.t('request_not_found'));
  const { provider_id } = req.body;
  if (!['number', 'string'].includes(typeof provider_id) || !Number.isSafeInteger(Number(provider_id)) || Number(provider_id) < 1 || Number(provider_id) > 2147483647) return error(res, req.t('invalid_data'));

  const provider = await queryOne(
    "SELECT id, role FROM users WHERE id = ? AND role = 'provider' AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL",
    [provider_id]
  );
  if (!provider) return error(res, req.t('account_not_found'));

  const updated = await Request.updateStatus(req.params.id, 'assigned', {
    assigned_provider_id: provider_id,
    actor: req.user,
  });
  if (updated && provider_id) {
    await notificationService.notifyUser(provider_id, {
      type: 'admin_assigned',
      title: req.t('status_updated'),
      body: updated.title,
      link: `/requests/${updated.id}`,
    });
  }
  return success(res, updated, req.t('status_updated'));
});

const cancelRequest = asyncHandler(async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) return notFound(res, req.t('request_not_found'));
  const updated = await Request.updateStatus(req.params.id, 'cancelled', {
    cancellation_reason: req.body.cancellation_reason || null,
    actor: req.user,
  });
  return success(res, updated, req.t('status_updated'));
});

const deleteRequest = asyncHandler(async (req, res) => {
  await Request.softDelete(req.params.id, req.user);
  return success(res, null, req.t('request_deleted'));
});

// --- Subscription plans CRUD ---
const listPlans = asyncHandler(async (req, res) => {
  const items = await Subscription.listPlans(false);
  return success(res, items);
});

const createPlan = asyncHandler(async (req, res) => {
  const plan = await Subscription.createPlan(req.body);
  require('../services/contentTranslation').later('subscription_plans', plan?.id); // AYK-343
  return created(res, plan, req.t('updated'));
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await Subscription.updatePlan(req.params.id, req.body);
  if (!plan) return notFound(res, req.t('plan_not_found'));
  require('../services/contentTranslation').later('subscription_plans', plan.id); // AYK-343
  return success(res, plan, req.t('updated'));
});

const deletePlan = asyncHandler(async (req, res) => {
  await Subscription.deletePlan(req.params.id);
  return success(res, null, req.t('deleted'));
});

// --- Reviews moderation ---
const listReviewsAdmin = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, visibility } = req.query;
  const { items, total } = await Review.listAdmin({ page, limit, visibility });
  return paginate(res, items, total, page, limit);
});

const hideReview = asyncHandler(async (req, res) => {
  await Review.setVisibility(req.params.id, false);
  return success(res, null, req.t('updated'));
});

const showReview = asyncHandler(async (req, res) => {
  await Review.setVisibility(req.params.id, true);
  return success(res, null, req.t('updated'));
});

const removeReview = asyncHandler(async (req, res) => {
  await Review.adminDelete(req.params.id);
  return success(res, null, req.t('deleted'));
});

// --- Conversation archives ---
const listArchives = asyncHandler(async (req, res) => {
  const { status = 'active', page = 1, limit = 30 } = req.query;
  const { items, total } = await ConversationArchive.list({ status, page, limit });
  return paginate(res, items, total, page, limit);
});

const archiveConversation = asyncHandler(async (req, res) => {
  if (req.body.retention_days !== undefined && (!['string', 'number'].includes(typeof req.body.retention_days) || !Number.isSafeInteger(Number(req.body.retention_days)) || Number(req.body.retention_days) < 1 || Number(req.body.retention_days) > 3650)) return error(res, req.t('invalid_data'), 400);
  const configured = Number(await Setting.get('chat_archive_retention_days').catch(() => 90));
  const retention = req.body.retention_days === undefined ? (Number.isSafeInteger(configured) && configured >= 1 && configured <= 3650 ? configured : 90) : Number(req.body.retention_days);
  const archive = await ConversationArchive.archiveConversation(req.params.id, {
    archived_by: req.user.id, retention_days: retention,
  });
  if (!archive) return notFound(res);
  return created(res, archive, req.t('updated'));
});

const getArchive = asyncHandler(async (req, res) => {
  const archive = await ConversationArchive.findById(req.params.id);
  if (!archive) return notFound(res);
  await logAdminAccess(req, 'admin.archive.read', archive.id, 'opened archive', 'conversation_archive');
  if (archive.payload && typeof archive.payload === 'string') {
    try { archive.payload = JSON.parse(archive.payload); } catch (_) {}
  }
  return success(res, archive);
});

const purgeArchives = asyncHandler(async (req, res) => {
  const purged = await ConversationArchive.purgeExpired();
  return success(res, { purged });
});

const restoreArchive = asyncHandler(async (req, res) => {
  await ConversationArchive.restore(req.params.id);
  return success(res, null, req.t('updated'));
});

const deleteArchive = asyncHandler(async (req, res) => {
  await ConversationArchive.remove(req.params.id);
  return success(res, null, req.t('deleted'));
});

// --- System: one-click migration runner ---
// POST /admin/system/migrate
// Admin-authenticated alternative to /api/setup/migrate?key=… — same
// idempotent runner under the hood, no JWT_SECRET copy/paste needed.
const applyMigrations = asyncHandler(async (req, res) => {
  const result = await runMigrationsFromEnv();
  return success(res, result, req.t('updated'));
});

// ─── Conversations monitor (admin) ──────────────────────────────────────
//
// Admins can list every conversation, peek into its messages and inspect
// the location-share trail. Every drill-in is recorded in activity_logs
// so reading someone's chat leaves a trace.

async function logAdminAccess(req, action, entityId, description, entityType = 'conversation') {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, action, entityType, entityId, description || null,
        (req.ip || '').slice(0, 60),
        String(req.headers['user-agent'] || '').slice(0, 240),
      ]
    );
  } catch (_) { /* logging is best-effort, never break the request */ }
}

const listConversationsAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  // Pull conversations + last message + participant names. The participants
  // are aggregated as a JSON-ish CSV column so the UI can render them
  // without N+1.
  const where = [];
  const params = [];
  if (search) {
    where.push(`EXISTS (
      SELECT 1 FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = c.id AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
    )`);
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const items = await query(
    `SELECT
       c.id, c.title, c.request_id, c.last_message_at, c.created_at,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS messages_count,
       (SELECT COUNT(*) FROM location_shares ls WHERE ls.conversation_id = c.id) AS locations_count,
       (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) AS last_message,
       (SELECT string_agg(u.full_name, ' • ' ORDER BY cp.user_id)
          FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = c.id) AS participants_names,
       (SELECT string_agg(CONCAT(u.id, ':', u.role), ',' ORDER BY cp.user_id)
          FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = c.id) AS participants_meta
     FROM conversations c
     ${whereSql}
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM conversations c ${whereSql}`,
    params
  );

  return paginate(res, items, total, page, limit);
});

const getConversationAdmin = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const conv = await queryOne(`SELECT * FROM conversations WHERE id = ?`, [id]);
  if (!conv) return notFound(res);

  await logAdminAccess(req, 'admin.conversation.read', id, 'opened conversation');

  const participants = await query(
    `SELECT cp.user_id, cp.joined_at, cp.last_read_at,
            u.full_name, u.email, u.phone, u.role, u.avatar
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = ?`,
    [id]
  );

  const messages = await query(
    `SELECT m.id, m.sender_id, m.content, m.message_type, m.latitude, m.longitude,
            m.is_read, m.read_at, m.is_edited, m.created_at, m.deleted_at,
            mf.file_url AS attachment_url, mf.duration_seconds, mf.file_type
     FROM messages m
     LEFT JOIN message_files mf ON mf.message_id = m.id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC`,
    [id]
  );

  const locations = await query(
    `SELECT id, user_id, sender_role, latitude, longitude, accuracy_m,
            heading, speed_kmh, is_live, expires_at, created_at
     FROM location_shares
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    [id]
  );

  return success(res, {
    conversation: conv,
    participants,
    messages,
    locations,
  });
});

// Live across the platform — anyone currently sharing their position
// (is_live = 1 and not expired). Useful at-a-glance situational map.
const liveLocationsAdmin = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ls.id, ls.conversation_id, ls.request_id, ls.user_id, ls.sender_role,
            ls.latitude, ls.longitude, ls.accuracy_m, ls.heading, ls.speed_kmh,
            ls.expires_at, ls.created_at,
            u.full_name, u.email, u.role
     FROM location_shares ls
     JOIN users u ON u.id = ls.user_id
     WHERE ls.is_live = 1
       AND (ls.expires_at IS NULL OR ls.expires_at > CURRENT_TIMESTAMP)
       AND ls.id IN (
         SELECT MAX(id) FROM location_shares WHERE is_live = 1
         GROUP BY conversation_id, user_id
       )
     ORDER BY ls.created_at DESC
     LIMIT 500`
  );
  return success(res, rows);
});

// ─── Admin permission editor ────────────────────────────────────────────
const { PERMISSIONS } = require('../config/permissions');
const { availability } = require('../utils/providerAvailability');
const { COVERAGE_SQL, coverageOf } = require('../utils/providerCoverage');

// Lists every permission key the UI can grant (for the dropdown / checkbox
// grid). Plain JSON; cached client-side.
const listPermissionRegistry = asyncHandler(async (req, res) => {
  return success(res, { permissions: PERMISSIONS });
});

const getUserPermissions = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const row = await queryOne(
    `SELECT id, role, is_super_admin, permissions FROM users WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return notFound(res);
  if (typeof row.permissions === 'string') {
    try { row.permissions = JSON.parse(row.permissions); } catch (_) { row.permissions = []; }
  }
  if (!Array.isArray(row.permissions)) row.permissions = [];
  return success(res, {
    id: row.id,
    role: row.role,
    is_super_admin: row.is_super_admin ? 1 : 0,
    permissions: row.permissions,
  });
});

const updateUserPermissions = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || (req.body.is_super_admin !== undefined && ![true, false, 0, 1].includes(req.body.is_super_admin)) || (req.body.permissions !== undefined && !Array.isArray(req.body.permissions))) return error(res, req.t('invalid_data'), 400);
  const updated = await User.updateAdminPermissions(id, req.body, req.user);
  if (!updated) return notFound(res);
  const wantSuper = !!updated.is_super_admin, clean = updated.permissions;
  const io = req.app.get('io');
  if (io) io.in(`user:${id}`).disconnectSockets(true);

  // Audit: who changed whose permissions.
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description)
       VALUES (?, 'admin.permissions.update', 'user', ?, ?)`,
      [req.user.id, id, `super=${wantSuper ? 1 : 0}, perms=${clean.join(',')}`]
    );
  } catch (_) {}

  return success(res, {
    id, is_super_admin: wantSuper ? 1 : 0, permissions: clean,
  }, req.t('updated'));
});

// GET /admin/marketing?from=YYYY-MM-DD&to=YYYY-MM-DD (AYK-030). Names of the
// top inviters are personal data, so they need the users permission too.
const marketing = asyncHandler(async (req, res) => {
  const stats = await require('../services/marketingStats').marketingStats({ from: req.query.from, to: req.query.to });
  if (!hasPermission(req.user, 'users.manage')) {
    stats.referrals.top = stats.referrals.top.map(({ full_name: _name, id: _id, ...row }) => row);
  }
  return success(res, stats);
});

// AYK-357 (the owner): special numbers, one repeated digit (11, 22 … 99, 111 … 999). Never given
// automatically; the administration moves an account to a free one («44 بدل 145»). Only special
// numbers can be given this way; any other number stays as the site gave it.
const SPECIALS = [...Array.from({ length: 9 }, (_, i) => String(i + 1).repeat(2)), ...Array.from({ length: 9 }, (_, i) => String(i + 1).repeat(3))];
const specialNumbers = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT id, full_name, referral_code FROM users WHERE referral_code IN (${SPECIALS.map(() => '?').join(',')}) AND deleted_at IS NULL`, SPECIALS);
  const taken = new Map(rows.map(r => [r.referral_code, { user_id: r.id, full_name: r.full_name }]));
  return success(res, { numbers: SPECIALS.map(code => ({ code, ...(taken.get(code) || {}), free: !taken.has(code) })) });
});
const assignSpecialNumber = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const code = String(req.body?.number || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !SPECIALS.includes(code)) return error(res, 'رقم غير مسموح: الأرقام المميزة فقط (مثل 11 و22 و111)', 400);
  const result = await transaction(async conn => {
    const [targets] = await conn.execute('SELECT id, role, is_super_admin, permissions, referral_code FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    const target = targets[0];
    if (!target) return { status: 404 };
    if (target.role === 'admin' && !canManageAdmin(req.user, target)) return { status: 403 };
    if (target.referral_code === code) return { status: 200, code };
    const [holders] = await conn.execute('SELECT id FROM users WHERE referral_code = ? AND id <> ? FOR UPDATE', [code, id]);
    if (holders.length) return { status: 409 };
    // The owner's rule: the previous number is freed, back in the pool for new accounts, with no tie
    // to this account (its chats, requests and wallet belong to the account, not to the number).
    const previous = target.referral_code;
    await conn.execute('DELETE FROM account_number_aliases WHERE code = ? OR user_id = ?', [code, id]);
    await conn.execute('UPDATE users SET referral_code = ? WHERE id = ?', [code, id]);
    await conn.execute(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'admin.number.assign', 'user', ?, ?)`,
      [req.user.id, id, `${previous || '-'} -> ${code}`]);
    return { status: 200, code, previous };
  });
  if (result.status === 404) return notFound(res);
  if (result.status === 403) return error(res, req.t('forbidden'), 403);
  if (result.status === 409) return error(res, 'هذا الرقم المميز مستخدم لحساب آخر', 409);
  return success(res, { id, referral_code: result.code, previous: result.previous || null }, req.t('updated'));
});

module.exports = {
  specialNumbers, assignSpecialNumber,
  marketing,
  dashboard, listAllRequests, getSettings, updateSettings,
  applyMigrations,
  listVerifications, reviewVerification,
  listAds, createAd, updateAd, deleteAd, uploadAdMedia,
  activityLogs, securityReport,
  updateRequest, assignRequest, cancelRequest, deleteRequest, hideRequest, listProvidersAdmin, hideProvider,
  listPlans, createPlan, updatePlan, deletePlan,
  listReviewsAdmin, hideReview, showReview, removeReview,
  listArchives, archiveConversation, getArchive, purgeArchives, restoreArchive, deleteArchive,
  listConversationsAdmin, getConversationAdmin, liveLocationsAdmin,
  listPermissionRegistry, getUserPermissions, updateUserPermissions,
};
