const Payment = require('../models/Payment');
const paymentService = require('../services/paymentService');
const notificationService = require('../services/notificationService');
const env = require('../config/env');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

const createSession = asyncHandler(async (req, res) => {
  const availability = paymentService.getAvailability();
  if (!availability.ready) return error(res, availability.message, 503);
  const { subscription_id, request_id, payment_method, currency = 'SAR' } = req.body;
  // Checkout prices come exclusively from the owner's pending subscription.
  // Request payments have no implemented pricing/settlement workflow.
  if (!Payment.validId(subscription_id) || request_id != null || currency !== 'SAR') return error(res, req.t('invalid_data'), 400);
  const sub = await require('../config/database').queryOne("SELECT * FROM subscriptions WHERE id = ? AND user_id = ? AND status = 'pending'", [subscription_id, req.user.id]);
  if (!sub || Payment.money(sub.amount) <= 0) return error(res, req.t('invalid_data'), 400);
  const amount = Payment.money(sub.amount);

  const payment = await Payment.create({
    user_id: req.user.id,
    subscription_id,
    request_id,
    provider: availability.provider,
    amount,
    currency,
    payment_method,
    metadata: { initiated_by: req.user.id },
  });

  const session = await paymentService.createCheckoutSession({
    amount, currency,
    metadata: { payment_id: payment.id, user_id: req.user.id, subscription_id, request_id },
    returnUrl: `${env.CLIENT_URL}/payments/return`,
  });

  if (!session.ok || !session.transaction_id || !session.checkout_url) {
    await Payment.updateStatus(payment.id, 'failed');
    return error(res, availability.message, 503);
  }
  if (session.transaction_id) {
    await Payment.updateStatus(payment.id, 'processing', session.transaction_id);
  }
  return success(res, { payment_id: payment.id, ...session });
});

const webhook = asyncHandler(async (req, res) => {
  const availability = paymentService.getAvailability();
  if (!availability.ready) {
    return res.status(503).json({ ok: false, message: availability.message });
  }
  try {
    const verification = await paymentService.verifyWebhook(req.body, req.headers);
    if (!verification.ok) {
      logger.warn('Payment webhook verification failed');
      return res.status(400).json({ ok: false });
    }

    const { payment, changed } = await Payment.settleVerified(verification);
    if (changed && verification.status === 'completed') {
      if (payment.subscription_id) {
        notificationService.notifyUser(payment.user_id, {
          type: 'subscription_activated',
          title: req.t('sub_activated'),
          body: 'شكراً لاشتراكك في منصتنا',
        });
      }
      notificationService.notifyUser(payment.user_id, {
        type: 'payment_success',
        title: req.t('payment_success'),
        body: `تم دفع ${payment.amount} ${payment.currency}`,
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error('Webhook handler error:', { code: err.code, status: err.status });
    return res.status(err.status || 500).json({ ok: false });
  }
});

const myPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const data = await Payment.listForUser(req.user.id, { page, limit });
  return success(res, data);
});

module.exports = { createSession, webhook, myPayments };
