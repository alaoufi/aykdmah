const express = require('express');
const router = express.Router();
const c = require('../controllers/adminController');
const adC = require('../controllers/adController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');
const { uploadAd } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(authenticate, requireAdmin);
router.use((req, res, next) => {
  for (const key of ['page', 'limit']) {
    if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || !/^\d+$/.test(req.query[key]) || Number(req.query[key]) < 1 || Number(req.query[key]) > (key === 'limit' ? 100 : 100000))) return res.status(400).json({ success: false, message: req.t('invalid_data') });
  }
  if (req.query.search !== undefined && (typeof req.query.search !== 'string' || req.query.search.length > 200)) return res.status(400).json({ success: false, message: req.t('invalid_data') });
  next();
});
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647) return res.status(400).json({ success: false, message: req.t('invalid_data') });
  next();
});

// Each route now also asks for a specific permission. Super admins
// pass straight through (requirePermission no-ops when is_super_admin
// is true). See server/config/permissions.js for the full list.
router.get('/dashboard', requirePermission('dashboard.view'), c.dashboard);
router.get('/marketing', requirePermission('dashboard.view'), c.marketing);

// Requests
router.get('/requests',                 requirePermission('requests.manage'), c.listAllRequests);
router.put('/requests/:id',             requirePermission('requests.manage'), c.updateRequest);
router.post('/requests/:id/assign',     requirePermission('requests.manage'), c.assignRequest);
router.put('/requests/:id/cancel',      requirePermission('requests.manage'), c.cancelRequest);
router.delete('/requests/:id',          requirePermission('requests.manage'), c.deleteRequest);

// Settings
router.get('/settings', requirePermission('settings.manage'), c.getSettings);
router.put('/settings', requirePermission('settings.manage'), c.updateSettings);

// Verifications
router.get('/verifications',                  requirePermission('verifications.review'), c.listVerifications);
router.post('/verifications/:id/review',      requirePermission('verifications.review'), c.reviewVerification);

// Ads — admin moderation (request workflow + direct CRUD)
router.get('/ads',               requirePermission('ads.manage'), adC.adminList);
router.post('/ads',              requirePermission('ads.manage'), c.createAd);
router.put('/ads/:id',           requirePermission('ads.manage'), c.updateAd);
router.delete('/ads/:id',        requirePermission('ads.manage'), c.deleteAd);
router.post('/ads/upload',       requirePermission('ads.manage'), uploadLimiter, uploadAd.single('file'), c.uploadAdMedia);
router.post('/ads/:id/approve',  requirePermission('ads.manage'), adC.adminApprove);
router.post('/ads/:id/reject',   requirePermission('ads.manage'), adC.adminReject);
router.post('/ads/:id/activate', requirePermission('ads.manage'), adC.adminActivate);
router.post('/ads/:id/pause',    requirePermission('ads.manage'), adC.adminPause);
router.post('/ads/:id/resume',   requirePermission('ads.manage'), adC.adminResume);
router.get('/ads/:id/stats',     requirePermission('ads.manage'), adC.adminStats);

// Per-placement pricing table + live diagnostic
router.get('/ads-pricing',      requirePermission('ads.manage'), adC.adminListPricing);
router.put('/ads-pricing',      requirePermission('ads.manage'), adC.adminBulkUpsertPricing);
router.get('/ads-preview-live', requirePermission('ads.manage'), adC.adminPreviewLive);
router.get('/ads/:id/diagnose', requirePermission('ads.manage'), adC.adminDiagnose);

// Messages to the administration (AYK-046).
const support = require('../controllers/supportController');
router.get('/support', requirePermission('users.manage'), support.adminList);
router.get('/support/unread', requirePermission('users.manage'), support.adminUnread);
router.get('/support/:id', requirePermission('users.manage'), support.adminGet);
router.post('/support/:id/messages', requirePermission('users.manage'), support.adminReply);
router.put('/support/:id/status', requirePermission('users.manage'), support.adminStatus);

// Where monthly subscriptions apply, by area and profession (AYK-042).
const rules = require('../controllers/subscriptionRulesController');
router.get('/subscription-rules', requirePermission('plans.manage'), rules.list);
router.put('/subscription-rules/enabled', requirePermission('plans.manage'), rules.setEnabled);
router.post('/subscription-rules', requirePermission('plans.manage'), rules.create);
router.put('/subscription-rules/:id', requirePermission('plans.manage'), rules.update);
router.delete('/subscription-rules/:id', requirePermission('plans.manage'), rules.remove);

// Subscription plans
router.get('/plans',          requirePermission('plans.manage'), c.listPlans);
router.post('/plans',         requirePermission('plans.manage'), c.createPlan);
router.put('/plans/:id',      requirePermission('plans.manage'), c.updatePlan);
router.delete('/plans/:id',   requirePermission('plans.manage'), c.deletePlan);

// Reviews moderation
router.get('/reviews',              requirePermission('reviews.manage'), c.listReviewsAdmin);
router.put('/reviews/:id/hide',     requirePermission('reviews.manage'), c.hideReview);
router.put('/reviews/:id/show',     requirePermission('reviews.manage'), c.showReview);
router.delete('/reviews/:id',       requirePermission('reviews.manage'), c.removeReview);

router.get('/activity-logs', requirePermission('activity_logs.view'), c.activityLogs);

// System maintenance — sensitive
router.post('/system/migrate', requirePermission('settings.manage'), c.applyMigrations);

// Conversation archives — same permission as reading live convos
router.get('/archives',                        requirePermission('conversations.read'), c.listArchives);
router.post('/archives/conversations/:id',     requirePermission('conversations.read'), c.archiveConversation);
router.get('/archives/:id',                    requirePermission('conversations.read'), c.getArchive);
router.post('/archives/purge',                 requirePermission('conversations.read'), c.purgeArchives);
router.put('/archives/:id/restore',            requirePermission('conversations.read'), c.restoreArchive);
router.delete('/archives/:id',                 requirePermission('conversations.read'), c.deleteArchive);

// Live conversation + location monitor (every drill-in is audit-logged)
router.get('/conversations',     requirePermission('conversations.read'), c.listConversationsAdmin);
router.get('/conversations/:id', requirePermission('conversations.read'), c.getConversationAdmin);
router.get('/live-locations',    requirePermission('conversations.read'), c.liveLocationsAdmin);

// Permission registry + admin permission editor (only the super admin
// or anyone with admins.manage can touch this).
router.get('/permissions',       requirePermission('admins.manage'), c.listPermissionRegistry);
router.get('/users/:id/permissions', requirePermission('admins.manage'), c.getUserPermissions);
router.put('/users/:id/permissions', requirePermission('admins.manage'), c.updateUserPermissions);

module.exports = router;
