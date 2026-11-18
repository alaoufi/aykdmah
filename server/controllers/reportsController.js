const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { success, error, notFound, forbidden } = require('../utils/apiResponse');
const { queryOne } = require('../config/database');
const backupReport = require('../services/backupReport');
const isSuperAdmin = user => user && (user.is_super_admin === 1 || user.is_super_admin === true);

// GET /api/admin/reports/backups  (AYK-271)
const backups = asyncHandler(async (req, res) => {
  const report = await backupReport.status({ fresh: req.query.fresh === '1' });
  // Downloading a backup is for the main administrator only: it holds the whole site (encrypted).
  return success(res, { ...report, can_download: isSuperAdmin(req.user) });
});

// POST /api/admin/reports/backups/link { key }: a two-minute link for one listed backup.
const backupLink = asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user)) return forbidden(res, req.t('forbidden'));
  const key = String(req.body?.key || '');
  if (!backupReport.config() || !await backupReport.isListed(key)) return notFound(res);
  return success(res, { url: `/api/report-files/backup?t=${encodeURIComponent(backupReport.linkToken(key, req.user.id))}` });
});

// GET /api/report-files/backup?t=...  The browser opens this directly. The link is checked, then
// its administrator again (still the main administrator, still active), then the backup is
// streamed from R2 as it is (encrypted).
const backupFile = asyncHandler(async (req, res) => {
  const link = backupReport.readToken(req.query.t);
  if (!link) return error(res, req.t('invalid_data'), 403);
  const admin = await queryOne('SELECT id, is_super_admin FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0', [link.userId]);
  if (!isSuperAdmin(admin) || !await backupReport.isListed(link.key)) return notFound(res);
  const r2 = await backupReport.open(link.key);
  if (r2.statusCode !== 200) { r2.resume(); return error(res, 'R2', 502); }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${path.basename(link.key)}"`,
    ...(r2.headers['content-length'] ? { 'Content-Length': r2.headers['content-length'] } : {}),
  });
  // The download stopped (closed tab, lost signal): stop reading from R2 too.
  res.on('close', () => { if (!r2.destroyed) r2.destroy(); });
  r2.on('error', () => res.destroy());
  r2.pipe(res);
  return undefined;
});

module.exports = { backups, backupLink, backupFile };
