const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const { microCache } = require('./middleware/microCache');
const { localeMiddleware } = require('./utils/i18n');

const app = express();
// Behind the Caddy proxy, use the client address it forwards.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"],
    workerSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    // Same sources as deploy/caddy/Caddyfile: map tiles and the LiveKit signaling origin.
    connectSrc: ["'self'", 'https://tiles.openfreemap.org', 'https://nominatim.openstreetmap.org',
      ...(() => { try { return process.env.LIVEKIT_URL ? [new URL(process.env.LIVEKIT_URL).origin] : []; } catch (_) { return []; } })(),
      // AYK-248: chat files are uploaded from the device straight to the R2 media bucket.
      ...(() => { try { return process.env.R2_MEDIA_ENDPOINT ? [new URL(process.env.R2_MEDIA_ENDPOINT).origin] : []; } catch (_) { return []; } })()],
    mediaSrc: ["'self'", 'blob:', 'https:'], objectSrc: ["'none'"],
    frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
  } },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
// Level 1 (AYK-251): the default level spent about a tenth of the server's time compressing when
// thousands opened the app at once; level 1 is several times cheaper for answers a little larger.
app.use(compression({ level: 1 }));
const allowedOrigins = new Set([env.CLIENT_URL, env.APP_URL, ...env.SITE_ORIGINS].filter(Boolean));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
}));
// Signed LiveKit webhooks need the raw body, so they are mounted before the JSON parser.
app.use('/api/calls/livekit-webhook', require('./routes/callRoutes').webhook);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(localeMiddleware);

if (env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // Do not log query strings: URLs can contain private location/search data.
  app.use(morgan(':method :url-path :status :response-time ms'));
}
morgan.token('url-path', req => req.path);

// Uploaded documents and chat files are served only through authorized media routes.
app.use(['/uploads', '/install'], (req, res) => res.status(404).end());
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// AYK-272: the waiting room. Beyond what this copy works on well at once, requests wait in line.
app.use('/api', require('./middleware/admissionQueue').admission);

// Wait for pending migrations before handling API requests.
let _migrationsPromise = null;
function bootMigrations() {
  if (_migrationsPromise) return _migrationsPromise;
  _migrationsPromise = (async () => {
    const { runMigrationsFromEnv } = require('./services/installService');
    const result = await runMigrationsFromEnv();
    if (result.applied.some(m => m.errors.length)) throw new Error('Database migrations failed.');
    const total = result.applied.reduce((a, m) => a + (m.ok || 0), 0);
    if (total > 0) console.log(`[migrations] applied ${result.applied.length} files, ${total} statements`);
  })().catch(err => { _migrationsPromise = null; throw err; });
  return _migrationsPromise;
}
app.use('/api', (req, res, next) => {
  if (!env.AUTO_MIGRATE) return next();
  return bootMigrations().then(() => next(), next);
});

// Search-engine pages and sitemap: crawlers fetch many pages, so no per-IP API limit.
app.use('/api/seo', require('./routes/seoRoutes'));
// AYK-251: public reads every app start asks for, answered from memory for 5 seconds.
app.use('/api', generalLimiter, microCache(5, ['/api/settings/public', '/api/categories', '/api/countries']), apiRoutes);

if (env.NODE_ENV === 'production' && fs.existsSync(env.PATHS.CLIENT_DIST)) {
  app.use(express.static(env.PATHS.CLIENT_DIST, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/install') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(env.PATHS.CLIENT_DIST, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
