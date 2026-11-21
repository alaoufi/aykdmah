// AYK-409: ad campaigns (an advertiser's ads under one period and one budget of views) and the
// reports: per ad and per campaign, views, clicks and click rate, and a CSV file to download.
const asyncHandler = require('../utils/asyncHandler');
const { query, queryOne } = require('../config/database');
const { success, error, notFound } = require('../utils/apiResponse');

const intOrNull = v => (v === null || v === undefined || v === '' ? null : Number(v));
const validDate = v => v === null || v === undefined || v === '' || Number.isFinite(Date.parse(v));
function cleanCampaign(body, creating) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if ((creating || body.name !== undefined) && (!name || name.length > 150)) return null;
  for (const f of ['max_views', 'daily_max_views']) {
    const v = body[f];
    if (v !== undefined && v !== null && v !== '' && !(Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2147483647)) return null;
  }
  if (!validDate(body.starts_at) || !validDate(body.ends_at)) return null;
  if (body.starts_at && body.ends_at && Date.parse(body.ends_at) <= Date.parse(body.starts_at)) return null;
  if (body.status !== undefined && !['active', 'paused', 'ended'].includes(body.status)) return null;
  for (const f of ['advertiser', 'notes']) if (body[f] !== undefined && body[f] !== null && (typeof body[f] !== 'string' || body[f].length > (f === 'notes' ? 2000 : 150))) return null;
  const out = {};
  if (body.name !== undefined || creating) out.name = name;
  for (const f of ['advertiser', 'notes']) if (body[f] !== undefined) out[f] = body[f] ? String(body[f]).trim() : null;
  for (const f of ['max_views', 'daily_max_views']) if (body[f] !== undefined) out[f] = intOrNull(body[f]);
  for (const f of ['starts_at', 'ends_at']) if (body[f] !== undefined) out[f] = body[f] || null;
  if (body.status !== undefined) out.status = body.status;
  return out;
}

const TOTALS = `
  (SELECT COUNT(*) FROM ads x WHERE x.campaign_id = c.id) AS ads_count,
  (SELECT COALESCE(SUM(x.views_count), 0) FROM ads x WHERE x.campaign_id = c.id) AS views,
  (SELECT COALESCE(SUM(x.clicks_count), 0) FROM ads x WHERE x.campaign_id = c.id) AS clicks,
  (SELECT COALESCE(SUM(s.views_count), 0) FROM ad_stats_daily s JOIN ads x ON x.id = s.ad_id WHERE x.campaign_id = c.id AND s.day = CURRENT_DATE) AS views_today`;
const ctr = (views, clicks) => (Number(views) > 0 ? Math.round((Number(clicks) / Number(views)) * 10000) / 100 : 0);
const shape = row => ({ ...row, ads_count: Number(row.ads_count) || 0, views: Number(row.views) || 0, clicks: Number(row.clicks) || 0, views_today: Number(row.views_today) || 0, ctr: ctr(row.views, row.clicks) });

const list = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT c.*, ${TOTALS} FROM ad_campaigns c ORDER BY c.status = 'active' DESC, c.id DESC LIMIT 500`);
  return success(res, rows.map(shape));
});

const create = asyncHandler(async (req, res) => {
  const data = cleanCampaign(req.body || {}, true);
  if (!data) return error(res, req.t('invalid_data'), 400);
  const cols = Object.keys(data);
  const row = await queryOne(`INSERT INTO ad_campaigns (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?) RETURNING id`, [...cols.map(c => data[c]), req.user.id]);
  return success(res, { id: row?.id }, req.t('ad_created'));
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return notFound(res);
  const data = cleanCampaign(req.body || {}, false);
  if (!data) return error(res, req.t('invalid_data'), 400);
  const cols = Object.keys(data);
  if (!cols.length) return success(res, null, req.t('no_updates'));
  const result = await query(`UPDATE ad_campaigns SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...cols.map(c => data[c]), id]);
  if (!result.affectedRows) return notFound(res);
  return success(res, null, req.t('updated'));
});

// Deleting a campaign keeps its ads (they leave the campaign).
const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return notFound(res);
  await query('UPDATE ads SET campaign_id = NULL WHERE campaign_id = ?', [id]);
  const result = await query('DELETE FROM ad_campaigns WHERE id = ?', [id]);
  if (!result.affectedRows) return notFound(res);
  return success(res, null, req.t('deleted'));
});

// Report rows per ad (and its daily lines) between two dates, for one campaign or all ads.
async function reportRows({ campaignId, adId, from, to }) {
  const where = ['s.day BETWEEN ? AND ?'];
  const params = [from, to];
  if (campaignId) { where.push('a.campaign_id = ?'); params.push(campaignId); }
  if (adId) { where.push('a.id = ?'); params.push(adId); }
  return query(`SELECT s.day, a.id AS ad_id, a.title, a.campaign_id, c.name AS campaign_name, a.placements, a.placement,
      s.views_count AS views, s.clicks_count AS clicks
    FROM ad_stats_daily s JOIN ads a ON a.id = s.ad_id LEFT JOIN ad_campaigns c ON c.id = a.campaign_id
    WHERE ${where.join(' AND ')} ORDER BY s.day, a.id`, params);
}
function period(req) {
  const day = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const to = day(req.query.to) || new Date().toISOString().slice(0, 10);
  const from = day(req.query.from) || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

// GET /api/admin/ad-reports?campaign_id=&from=&to= — totals per ad with click rate, and per day.
const report = asyncHandler(async (req, res) => {
  const { from, to } = period(req);
  const rows = await reportRows({ campaignId: intOrNull(req.query.campaign_id), adId: intOrNull(req.query.ad_id), from, to });
  const byAd = new Map();
  for (const r of rows) {
    const a = byAd.get(r.ad_id) || { ad_id: r.ad_id, title: r.title, campaign_name: r.campaign_name, views: 0, clicks: 0 };
    a.views += Number(r.views) || 0; a.clicks += Number(r.clicks) || 0;
    byAd.set(r.ad_id, a);
  }
  const ads = [...byAd.values()].map(a => ({ ...a, ctr: ctr(a.views, a.clicks) })).sort((x, y) => y.ctr - x.ctr || y.views - x.views);
  const total = ads.reduce((t, a) => ({ views: t.views + a.views, clicks: t.clicks + a.clicks }), { views: 0, clicks: 0 });
  return success(res, { from, to, total: { ...total, ctr: ctr(total.views, total.clicks) }, ads,
    days: rows.map(r => ({ day: String(r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day).slice(0, 10), ad_id: r.ad_id, views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 })) });
});

// CSV (opens in Excel, Arabic kept by the BOM).
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function sendCsv(res, rows, name) {
  const head = ['اليوم', 'رقم الإعلان', 'الإعلان', 'الحملة', 'المشاهدات', 'النقرات', 'نسبة النقر %'];
  const lines = rows.map(r => [String(r.day instanceof Date ? r.day.toISOString() : r.day).slice(0, 10), r.ad_id, r.title, r.campaign_name || '', Number(r.views) || 0, Number(r.clicks) || 0, ctr(r.views, r.clicks)].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send('﻿' + [head.join(','), ...lines].join('\n'));
}
const reportCsv = asyncHandler(async (req, res) => {
  const { from, to } = period(req);
  const rows = await reportRows({ campaignId: intOrNull(req.query.campaign_id), adId: intOrNull(req.query.ad_id), from, to });
  return sendCsv(res, rows, `ads-report-${from}-${to}`);
});
// GET /api/ads/:id/report.csv — the advertiser's own ad.
const myReportCsv = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ad = Number.isSafeInteger(id) ? await queryOne('SELECT id, user_id FROM ads WHERE id = ?', [id]) : null;
  if (!ad || Number(ad.user_id) !== Number(req.user.id)) return notFound(res);
  const { from, to } = period(req);
  return sendCsv(res, await reportRows({ adId: id, from, to }), `ad-${id}-${from}-${to}`);
});

module.exports = { list, create, update, remove, report, reportCsv, myReportCsv, cleanCampaign };
