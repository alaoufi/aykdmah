const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const c = require('../controllers/offerController');
const { authenticate } = require('../middleware/auth');
const { requireMarketplaceWrite, requireSelectedProviderVerification } = require('../middleware/verificationPolicy');

router.post('/', authenticate, requireMarketplaceWrite, body('request_id').isInt({ min: 1, max: 2147483647 }).toInt(), validate, c.create);
router.get('/my', authenticate, c.getMy);
router.get('/request/:requestId', authenticate, param('requestId').isInt({ min: 1, max: 2147483647 }).toInt(), validate, c.getForRequest);
router.put('/:id/accept', authenticate, requireMarketplaceWrite, param('id').isInt({ min: 1, max: 2147483647 }).toInt(), validate, requireSelectedProviderVerification, c.accept);
router.put('/:id/reject', authenticate, param('id').isInt({ min: 1, max: 2147483647 }).toInt(), validate, c.reject);

module.exports = router;
