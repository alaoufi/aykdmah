const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const pushService = require('../services/pushService');
const PushSubscription = require('../models/PushSubscription');
const { SUPPORTED } = require('../utils/i18n');

// Public: the browser needs the server's VAPID key to subscribe.
router.get('/key', (req, res) => success(res, { key: pushService.getPublicKey() }));

router.post('/subscribe', authenticate, asyncHandler(async (req, res) => {
  const subscription = req.body?.subscription;
  if (!pushService.getPublicKey()) return error(res, 'push_unavailable', 503);
  if (!pushService.validSubscription(subscription)) return error(res, 'push_invalid_subscription', 400);
  const lang = SUPPORTED.includes(req.lang) ? req.lang : 'ar';
  await PushSubscription.save(req.user.id, subscription, lang);
  return success(res, { subscribed: true });
}));

// Called on sign-out so this device stops ringing for the previous account.
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (endpoint) await PushSubscription.remove(req.user.id, endpoint);
  return success(res, { subscribed: false });
}));

module.exports = router;
