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
const { localeMiddleware } = require('./utils/i18n');

const app = express();
// Behind Vercel or the self-hosted Caddy proxy, use the client address it forwards.
if (process.env.VERCEL || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    workerSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    connectSrc: ["'self'", 'https://nominatim.openstreetmap.org', 'https://huggingface.co', 'https://*.hf.co'],
    mediaSrc: ["'self'", 'blob:', 'https:'], objectSrc: ["'none'"],
    frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
  } },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
const allowedOrigins = new Set([env.CLIENT_URL, env.APP_URL].filter(Boolean));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
}));
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

// Wait before handling requests locally. Vercel schema initialization runs
// separately; starting a background schema job after responding is unreliable.
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

app.use('/api', generalLimiter, apiRoutes);

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
