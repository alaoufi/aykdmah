const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const calls = require('../services/callService');
const logger = require('../utils/logger');

// Starting calls is the abusable action: cap it per user, not just per IP.
const startLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `call-start:${req.user?.id}`,
  message: { success: false, message: 'call_rate_limited' },
});

const handle = fn => asyncHandler(async (req, res) => {
  try { return success(res, await fn(req)); }
  catch (err) {
    if (err.code && err.status) return error(res, err.code, err.status);
    throw err;
  }
});

router.post('/', authenticate, startLimiter, handle(req =>
  calls.start({ caller: req.user, conversationId: req.body?.conversation_id, callType: req.body?.call_type })));
router.get('/active', authenticate, handle(req => calls.active(req.user.id)));
router.get('/history', authenticate, handle(req =>
  calls.history(req.user.id, { conversationId: req.query.conversation_id, requestId: req.query.request_id })));
router.get('/eligibility/:userId', authenticate, handle(req => calls.eligibility(req.user.id, Number(req.params.userId))));
router.get('/admin/stats', authenticate, requireAdmin, handle(req => calls.stats({ days: req.query.days })));
router.patch('/admin/reports/:id', authenticate, requireAdmin, handle(req =>
  calls.reviewReport(req.params.id, req.user.id, req.body?.status)));
router.post('/:id/accept', authenticate, handle(req => calls.accept(req.params.id, req.user)));
router.post('/:id/decline', authenticate, handle(req => calls.decline(req.params.id, req.user)));
router.post('/:id/token', authenticate, handle(req => calls.joinToken(req.params.id, req.user)));
router.post('/:id/report', authenticate, handle(req => calls.report(req.params.id, req.user, req.body?.reason)));

// LiveKit webhook (mounted before the JSON parser in app.js; the signature covers the raw body).
const webhook = express.Router();
webhook.post('/', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  try {
    const result = await calls.handleWebhook(req.body.toString('utf8'), req.get('Authorization'));
    res.json({ success: true, ...result });
  } catch (err) {
    logger.warn('Rejected LiveKit webhook:', err.message);
    res.status(401).json({ success: false });
  }
});

module.exports = { router, webhook };
