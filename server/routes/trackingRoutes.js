const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, value) => {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) return res.status(422).json({ success: false, message: 'invalid_id' });
  next();
});
const loc = require('../controllers/locationController');
const { authenticate } = require('../middleware/auth');

// Top-level live-tracking endpoint scoped to an order
router.get('/requests/:id', authenticate, loc.getRequestTracking);

module.exports = router;
