const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.post('/session', authenticate, c.createSession);
router.post('/webhook', c.webhook);
router.get('/my', authenticate, c.myPayments);
// Test mode only (PAYMENT_PROVIDER=test); every handler refuses otherwise.
router.get('/test/:id', authenticate, c.testPayment);
router.post('/test/:id/complete', authenticate, c.completeTestPayment);
router.post('/test/:id/cancel', authenticate, c.cancelTestPayment);

module.exports = router;
