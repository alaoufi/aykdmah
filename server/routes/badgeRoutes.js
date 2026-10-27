const express = require('express');
const router = express.Router();
const c = require('../controllers/badgeController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');

const adminGate = [requireAdmin, requirePermission('badges.manage')];

router.use(authenticate);

// Provider self-service
router.get('/me', c.myBadges);
router.post('/request', c.requestBadge);
router.post('/:id/pay', c.payBadge);
router.post('/:id/cancel', c.cancelBadge);

// Admin moderation (mounted under /admin/badges too via routes/index.js)
router.get('/admin',                 ...adminGate, c.adminList);
router.post('/admin/:id/approve',    ...adminGate, c.adminApprove);
router.post('/admin/:id/reject',     ...adminGate, c.adminReject);

module.exports = router;
