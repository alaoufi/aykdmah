const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, value) => {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) return res.status(422).json({ success: false, message: 'invalid_id' });
  next();
});
router.param('providerId', (req, res, next, value) => {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) return res.status(422).json({ success: false, message: 'invalid_id' });
  next();
});

const c = require('../controllers/reviewController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadReview } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { requireMarketplaceBrowse } = require('../middleware/verificationPolicy');

router.post('/', authenticate, uploadLimiter, uploadReview.array('images', 4), c.create);

// Public — list reviews about a user (provider or requester direction)
router.get('/user/:id', optionalAuth, requireMarketplaceBrowse, c.getForUser);
router.get('/user/:id/stats', optionalAuth, requireMarketplaceBrowse, c.getStats);

// Back-compat path used by existing client code
router.get('/provider/:providerId', optionalAuth, requireMarketplaceBrowse, c.getForProvider);

router.put('/:id/reply', authenticate, c.reply);
router.get('/:id/translation', optionalAuth, requireMarketplaceBrowse, c.getTranslation);
router.post('/:id/helpful', authenticate, c.voteHelpful);
router.post('/:id/report', authenticate, c.report);

module.exports = router;
