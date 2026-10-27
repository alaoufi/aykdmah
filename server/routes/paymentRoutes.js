const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.post('/session', authenticate, c.createSession);
router.post('/webhook', c.webhook);
router.get('/my', authenticate, c.myPayments);

module.exports = router;
