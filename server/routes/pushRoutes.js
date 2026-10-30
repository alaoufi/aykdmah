const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const pushService = require('../services/pushService');
const PushSubscription = require('../models/PushSubscription');
const { SUPPORTED } = require('../utils/i18n');
const logger = require('../utils/logger');

// Public: the browser needs the server's VAPID key to subscribe.
router.get('/key', (req, res) => success(res, { key: pushService.getPublicKey() }));

router.post('/subscribe', authenticate, asyncHandler(async (req, res) => {
  const subscription = req.body?.subscription;
  if (!pushService.getPublicKey()) return error(res, 'push_unavailable', 503);
  if (!pushService.validSubscription(subscription)) {
    let host = 'unparsable';
    try { host = new URL(subscription?.endpoint).host; } catch (_) { /* keep 'unparsable' */ }
    logger.warn(`Push subscription rejected: host=${host} user=${req.user.id}`);
    return error(res, 'push_invalid_subscription', 400);
  }
  const lang = SUPPORTED.includes(req.lang) ? req.lang : 'ar';
  await PushSubscription.save(req.user.id, subscription, lang);
  return success(res, { subscribed: true });
}));

// A test notification to the user's own devices (AYK-061), at most once every 20 s.
const lastTest = new Map();
router.post('/test', authenticate, asyncHandler(async (req, res) => {
  if (Date.now() - (lastTest.get(req.user.id) || 0) < 20000) return error(res, req.t ? req.t('push_test_wait') : 'push_test_wait', 429);
  lastTest.set(req.user.id, Date.now());
  const { translate } = require('../utils/i18n');
  const sent = await pushService.sendToUser(req.user.id, lang => ({
    kind: 'message', tag: 'ayk-test', url: '/chat',
    title: translate(lang, 'push_test_title'), body: translate(lang, 'push_test_body'),
  }), { TTL: 120, urgency: 'high' });
  return success(res, { sent });
}));

// Called on sign-out so this device stops ringing for the previous account.
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (endpoint) await PushSubscription.remove(req.user.id, endpoint);
  return success(res, { subscribed: false });
}));

module.exports = router;
