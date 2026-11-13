const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const wallet = require('../services/walletService');

// Password-confirmed money actions are rate limited per account.
const moneyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `wallet:${req.user?.id}`,
  message: { success: false, message: 'too_many_attempts' },
});

const handle = fn => asyncHandler(async (req, res) => {
  try { return success(res, await fn(req)); }
  catch (err) {
    if (err.code && err.status && typeof err.code === 'string' && !/^\d/.test(err.code)) return error(res, err.code, err.status);
    throw err;
  }
});
const providerOnly = (req, res, next) => (req.user?.role === 'provider' ? next() : error(res, 'providers_only', 403));
const admin = [authenticate, requireAdmin, requirePermission('wallets.manage')];

router.get('/', authenticate, providerOnly, handle(req => wallet.summary(req.user.id)));
router.post('/coupon', authenticate, moneyLimiter, handle(req => wallet.applyReferralCode(req.user.id, req.body?.code)));
router.post('/withdrawals', authenticate, providerOnly, moneyLimiter, handle(req => wallet.requestWithdrawal(req.user, req.body || {})));
router.post('/withdrawals/:id/cancel', authenticate, providerOnly, handle(req => wallet.cancelWithdrawal(req.user, req.params.id)));
router.post('/gift/preview', authenticate, providerOnly, handle(req => wallet.previewGift(req.user, req.body || {})));
router.post('/gift', authenticate, providerOnly, moneyLimiter, handle(req => wallet.giftSubscription(req.user, req.body || {})));

router.get('/admin', ...admin, handle(() => wallet.adminOverview()));
router.get('/admin/users/:id', ...admin, handle(req => wallet.adminLedger(req.params.id)));
router.post('/admin/users/:id/adjust', ...admin, handle(req => wallet.adminAdjust(req.user, req.params.id, req.body || {})));
router.post('/admin/withdrawals/:id', ...admin, handle(req => wallet.processWithdrawal(req.user, req.params.id, req.body || {})));
router.put('/admin/settings', ...admin, handle(req => wallet.setSettings(req.body || {})));

module.exports = router;
