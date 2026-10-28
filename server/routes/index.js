const express = require('express');
const router = express.Router();

const Setting = require('../models/Setting');
const env = require('../config/env');

// Database installation and recovery run through the deployment CLI only.
router.use('/setup', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));
router.use('/media', require('./mediaRoutes'));

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.get('/providers/matching', require('../middleware/auth').optionalAuth,
  require('../middleware/verificationPolicy').requireMarketplaceBrowse,
  require('../controllers/providerMapController').matching);
router.get('/providers/nearby', require('../middleware/auth').optionalAuth,
  require('../middleware/verificationPolicy').requireMarketplaceBrowse,
  require('../controllers/providerMapController').nearby);
router.use('/countries', require('./countryRoutes'));

// Reverse geocoding for the register form's GPS auto-fill.
router.get('/geo/reverse', require('../controllers/geoController').reverse);
// Forward address search; a tighter limit protects the shared Nominatim quota.
router.get('/geo/search', require('express-rate-limit')({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'تجاوزت الحد المسموح من عمليات البحث. حاول بعد دقيقة.' },
}), require('../controllers/geoController').search);

router.use('/categories', require('./categoryRoutes'));
router.use('/services', require('./serviceRoutes'));
router.use('/regions', require('./regionRoutes'));
router.use('/governorates', require('./governorateRoutes'));
router.use('/cities', require('./cityRoutes'));
router.use('/districts', require('./districtRoutes'));
router.use('/requests', require('./requestRoutes'));
router.use('/offers', require('./offerRoutes'));
router.use('/chat', require('./chatRoutes'));
router.use('/calls', require('./callRoutes').router);
router.use('/wallet', require('./walletRoutes'));
router.use('/reviews', require('./reviewRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/push', require('./pushRoutes'));
router.use('/subscriptions', require('./subscriptionRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/admin/integrations', require('./integrationRoutes'));
router.use('/disputes', require('./disputeRoutes'));
router.use('/tracking', require('./trackingRoutes'));
router.use('/verify', require('./verificationRoutes'));
router.use('/badges', require('./badgeRoutes'));
router.use('/ads',    require('./adRoutes'));

// Public ad media streaming — admin uploads to /admin/ads/upload
// (which stores bytes in ad_media), then ads reference the file
// here. Lives at the top level so visitors can fetch without auth.
router.get('/ads/media/:id', async (req, res, next) => {
  try {
    const AdMedia = require('../models/AdMedia');
    const file = await AdMedia.findById(Number(req.params.id));
    if (!file) return res.status(404).end();
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(file.data);
  } catch (err) { next(err); }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), env: env.NODE_ENV });
});

// Public liveness probes do not reveal database configuration or server errors.
router.get('/health/db', async (req, res) => {
  try {
    await require('../config/database').query('SELECT 1');
    res.json({ ok: true });
  } catch (_) {
    res.status(503).json({ ok: false });
  }
});

router.get('/settings/public', async (req, res, next) => {
  try {
    const settings = await Setting.getPublic();
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

// Public platform stats — bottom-of-homepage counters. Cached in
// memory for 60s so a viral homepage hit doesn't translate into N
// COUNT(*) round-trips. Each counter is independently safeCounted so
// a missing table (eg. after a wipe) returns 0 instead of breaking
// the whole response.
let _statsCache = null;
let _statsCacheAt = 0;
const STATS_TTL_MS = 60 * 1000;

router.get('/stats/public', async (req, res, next) => {
  try {
    if (_statsCache && Date.now() - _statsCacheAt < STATS_TTL_MS) {
      return res.json({ success: true, data: _statsCache, cached: true });
    }
    const { query } = require('../config/database');
    const safe = async (sql) => {
      try { const [r] = await query(sql); return Number(r?.v || 0); } catch (_) { return 0; }
    };
    const [
      providers, clients, requests, completed, cities, countries,
      reviews, ratingAvg, conversations24, messages24, providersOnline,
      offers, urgent,
    ] = await Promise.all([
      safe("SELECT COUNT(*) v FROM users WHERE role='provider' AND is_active=1 AND deleted_at IS NULL"),
      safe("SELECT COUNT(*) v FROM users WHERE role='client'   AND is_active=1 AND deleted_at IS NULL"),
      safe("SELECT COUNT(*) v FROM requests WHERE deleted_at IS NULL"),
      safe("SELECT COUNT(*) v FROM requests WHERE status='completed'"),
      safe("SELECT COUNT(*) v FROM cities WHERE is_active=1"),
      safe("SELECT COUNT(*) v FROM countries WHERE is_active=1"),
      safe("SELECT COUNT(*) v FROM reviews"),
      safe("SELECT ROUND(AVG(rating)*10)/10 v FROM reviews WHERE rating > 0"),
      safe("SELECT COUNT(*) v FROM conversations WHERE last_message_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
      safe("SELECT COUNT(*) v FROM messages WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND deleted_at IS NULL"),
      safe("SELECT COUNT(*) v FROM users WHERE role='provider' AND is_online=1 AND deleted_at IS NULL"),
      safe("SELECT COUNT(*) v FROM offers"),
      safe("SELECT COUNT(*) v FROM requests WHERE is_urgent=1 AND status IN ('open','assigned') AND deleted_at IS NULL"),
    ]);
    _statsCache = {
      providers, clients, requests, completed,
      cities, countries, reviews,
      rating_avg: ratingAvg,
      conversations_24h: conversations24,
      messages_24h: messages24,
      providers_online: providersOnline,
      offers, urgent_open: urgent,
      generated_at: Date.now(),
    };
    _statsCacheAt = Date.now();
    res.json({ success: true, data: _statsCache, cached: false });
  } catch (err) { next(err); }
});

module.exports = router;
