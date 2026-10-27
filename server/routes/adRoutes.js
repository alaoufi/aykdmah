const express = require('express');
const router = express.Router();
const c = require('../controllers/adController');
const { authenticate, optionalAuth } = require('../middleware/auth');

// Public — visitors fetch live ads, track views, follow clicks.
router.get('/live', c.live);
router.get('/placement-pricing', c.placementPricing);
router.get('/my-geo', c.myGeo);
router.post('/:id/view', c.trackView);
router.post('/:id/click', c.trackClick);

// Authenticated users (provider OR client) — submit and manage their own
router.get('/me',           authenticate, c.myAds);
router.post('/quote',       authenticate, c.previewQuote);
router.post('/request',     authenticate, c.submit);
router.get('/:id/stats',    authenticate, c.stats);
router.post('/:id/pay',     authenticate, c.pay);
router.post('/:id/pause',   authenticate, c.pauseMine);
router.post('/:id/resume',  authenticate, c.resumeMine);
router.post('/:id/cancel',  authenticate, c.cancel);

module.exports = router;
