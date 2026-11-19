const express = require('express');
const router = express.Router();
const { smsLimiter } = require('../middleware/rateLimiter');
const c = require('../controllers/verificationController');
const { authenticate } = require('../middleware/auth');

router.get('/policy', c.getPolicy);
router.get('/status', authenticate, c.getStatus);

router.post('/nafath/start', authenticate, c.nafathStart);
router.post('/nafath/poll',  authenticate, c.nafathPoll);
router.post('/:method/start',  authenticate, smsLimiter, c.start); // AYK-240: paid messages, at most 10 an hour per address
router.post('/:method/confirm', authenticate, c.confirm);

router.get('/audit', authenticate, c.myAudit);

module.exports = router;
