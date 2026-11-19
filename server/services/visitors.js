// Visitor counter and request views (AYK-244).
// - Each visitor counts once a day: a signed-in account by its id, anyone else by a hash of
//   address and browser (the address itself is not stored). Crawlers are not counted.
// - "Online now" = visitors seen in the last 5 minutes (the page reports every 2 minutes while open).
// - visitors_public (admin setting) shows the counter and request views to everyone; when it is off
//   only admin accounts see them.
const crypto = require('crypto');
const { query, queryOne } = require('../config/database');
const Setting = require('../models/Setting');

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|headless|lighthouse|monitor|uptime/i;
const ONLINE_MS = 5 * 60 * 1000;
const online = new Map(); // viewer key -> last seen (ms)
let lastPrune = 0;
const counted = new Set(); // visitors this process already counted on countedDay
let countedDay = '';
let statsCache = null; // { at, today, total }
const STATS_MS = process.env.NODE_ENV === 'test' ? 0 : 10000;

// AYK-253: the "online now" list forgets idle visitors on a timer (it was only cleaned when
// someone read the counter) and never holds more than 200,000 entries.
setInterval(() => { const cutoff = Date.now() - ONLINE_MS; for (const [key, at] of online) if (at < cutoff) online.delete(key); }, 60000).unref();
const markOnline = key => { if (online.size >= 200000) online.clear(); online.set(key, Date.now()); };

const isBot = req => BOT.test(String(req.headers?.['user-agent'] || ''));

function viewerKey(req) {
  if (req.user?.id) return `u${req.user.id}`;
  const raw = `${req.ip || ''}|${req.headers?.['user-agent'] || ''}`;
  return `a${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40)}`;
}

const isAdminViewer = req => Boolean(req.user && (req.user.role === 'admin' || Number(req.user.admin_account) === 1));
const isPublic = async () => Setting.get('visitors_public', true).catch(() => true);

async function canSee(req) {
  return isAdminViewer(req) || Boolean(await isPublic());
}

// Express middleware: removes views_count from every JSON response of the router it is mounted
// on, unless the views are public or the viewer has an admin account (checked at response time,
// after authentication). The setting is read per request, so the admin switch applies at once.
async function viewsFilter(req, res, next) {
  const isPublicNow = Boolean(await isPublic());
  const json = res.json.bind(res);
  res.json = body => json(isPublicNow || isAdminViewer(req) ? body : stripViews(body));
  next();
}

function stripViews(value) {
  if (Array.isArray(value)) return value.map(stripViews);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (k !== 'views_count') out[k] = stripViews(v);
    return out;
  }
  return value;
}

async function prune() {
  if (Date.now() - lastPrune < 60 * 60 * 1000) return;
  lastPrune = Date.now();
  await query("DELETE FROM entity_views WHERE view_day < CURRENT_DATE - INTERVAL '1 day'").catch(() => {});
}

// Counts this visitor for today (once) and marks it online. Returns nothing.
async function recordVisit(req) {
  if (isBot(req)) return;
  const key = viewerKey(req);
  markOnline(key);
  // AYK-256: an open page reports every 2 minutes; once this copy of the server has counted the
  // visitor today, the later reports are answered from memory instead of asking the database again.
  const day = new Date().toISOString().slice(0, 10);
  if (day !== countedDay) { countedDay = day; counted.clear(); }
  if (counted.has(key)) return;
  if (counted.size >= 200000) counted.clear();
  counted.add(key);
  const inserted = await query(
    "INSERT INTO entity_views (entity_type, entity_id, viewer_key, view_day) VALUES ('site', 0, ?, CURRENT_DATE) ON CONFLICT DO NOTHING",
    [key]);
  if (inserted.affectedRows) {
    await query('INSERT INTO visit_days (day, visitors) VALUES (CURRENT_DATE, 1) ON CONFLICT (day) DO UPDATE SET visitors = visit_days.visitors + 1');
  }
  prune();
}

// A request's views: each viewer once a day; its owner and crawlers are not counted.
async function recordRequestView(req, request) {
  if (isBot(req) || (req.user?.id && Number(req.user.id) === Number(request.client_id))) return;
  const inserted = await query(
    "INSERT INTO entity_views (entity_type, entity_id, viewer_key, view_day) VALUES ('request', ?, ?, CURRENT_DATE) ON CONFLICT DO NOTHING",
    [request.id, viewerKey(req)]);
  if (inserted.affectedRows) await query('UPDATE requests SET views_count = views_count + 1 WHERE id = ?', [request.id]);
}

async function stats() {
  const now = Date.now();
  for (const [key, at] of online) if (now - at > ONLINE_MS) online.delete(key);
  // AYK-256: the two totals are read at most once every 10 seconds, whoever asks.
  if (!statsCache || now - statsCache.at >= STATS_MS) {
    const row = await queryOne(`SELECT COALESCE(SUM(visitors), 0) AS total,
      COALESCE(SUM(CASE WHEN day = CURRENT_DATE THEN visitors ELSE 0 END), 0) AS today FROM visit_days`);
    statsCache = { at: now, today: Number(row?.today || 0), total: Number(row?.total || 0) };
  }
  return { today: statsCache.today, total: statsCache.total, online: online.size };
}


module.exports = { recordVisit, recordRequestView, stats, canSee, viewsFilter, stripViews, isBot, viewerKey };
