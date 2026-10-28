const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, value) => {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) return res.status(422).json({ success: false, message: 'invalid_id' });
  next();
});

const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const c = require('../controllers/requestController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadRequest } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { requireMarketplaceWrite, requireMarketplaceBrowse } = require('../middleware/verificationPolicy');

router.get('/nearby', optionalAuth, requireMarketplaceBrowse, c.getNearby);
router.get('/my', authenticate, c.getMy);
router.post('/', authenticate, requireMarketplaceWrite, uploadLimiter, uploadRequest.array('files', 8), [
  // Short or empty texts are accepted: the model fills a sensible title and description.
  body('title').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  body('description').optional({ checkFalsy: true }).isString().trim().isLength({ max: 10000 }),
  body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }),
  body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }),
], validate, c.create);
router.get('/:id', optionalAuth, requireMarketplaceBrowse, c.getOne);
router.put('/:id/status', authenticate, c.updateStatus);
router.delete('/:id', authenticate, c.remove);
router.post('/:id/chat', authenticate, requireMarketplaceWrite, c.startChat);

module.exports = router;
