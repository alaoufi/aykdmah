const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const rootEnv = [
  path.join(__dirname, '..', '..', '.env.local'),
  path.join(__dirname, '..', '..', '.env'),
].find(file => fs.existsSync(file));
if (process.env.NODE_ENV === 'test') {
  // Disposable tests must never import production credentials from local files.
} else if (rootEnv) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

const configuredJwtSecret = process.env.JWT_SECRET || '';
const weakJwtSecret = configuredJwtSecret.length < 32
  || ['change_me', 'change_me_to_a_long_random_string'].includes(configuredJwtSecret);
if (process.env.NODE_ENV === 'production' && weakJwtSecret) {
  throw new Error('Set a unique JWT_SECRET of at least 32 characters before production startup.');
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_NAME: process.env.APP_NAME || 'AWTAD SERVICES',
  APP_URL: process.env.APP_URL || 'http://localhost:5000',
  APP_PORT: parseInt(process.env.APP_PORT || '5000', 10),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  // Schema changes are performed separately on Vercel, before traffic reaches
  // the deployment. Local servers wait for migration completion on first use.
  AUTO_MIGRATE: process.env.AUTO_MIGRATE == null
    ? !process.env.VERCEL
    : process.env.AUTO_MIGRATE === 'true',

  DB: {
    // PostgreSQL (Supabase / Neon / Railway / self-hosted).
    // Prefer the single DATABASE_URL string when present — that's how
    // every managed Postgres provider hands out credentials. The
    // discrete vars are kept as a fallback for self-hosted setups.
    URL:  process.env.DATABASE_URL || '',
    DIRECT_URL: process.env.DIRECT_DATABASE_URL || '',
    POOL_MAX: parseInt(process.env.DB_POOL_MAX || (process.env.VERCEL ? '3' : '10'), 10),
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseInt(process.env.DB_PORT || '5432', 10),
    NAME: process.env.DB_NAME || '',
    USER: process.env.DB_USER || '',
    PASSWORD: process.env.DB_PASSWORD || '',
    // TLS handling:
    //   '' | 'false' | '0'   → no TLS (local dev)
    //   any enabled mode     → verify the server certificate
    SSL: process.env.DB_SSL || ((process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL) ? 'true' : ''),
  },

  JWT: {
    SECRET: weakJwtSecret ? require('crypto').randomBytes(48).toString('hex') : configuredJwtSecret,
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  },

  UPLOAD: {
    // 4MB default — fits Vercel's standard serverless body limit.
    // Bump UPLOAD_MAX_SIZE in env on hosts that allow larger bodies.
    MAX_SIZE: parseInt(process.env.UPLOAD_MAX_SIZE || '4194304', 10),
    DIR: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  },

  MAP: {
    PROVIDER: process.env.MAP_PROVIDER || 'osm',
    GOOGLE_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  },

  MAIL: {
    HOST: process.env.MAIL_HOST || '',
    PORT: parseInt(process.env.MAIL_PORT || '587', 10),
    USER: process.env.MAIL_USER || '',
    PASSWORD: process.env.MAIL_PASSWORD || '',
    FROM: process.env.MAIL_FROM || '',
  },

  WHATSAPP: {
    PROVIDER: process.env.WHATSAPP_PROVIDER || '',
    TOKEN: process.env.WHATSAPP_TOKEN || '',
    FROM: process.env.WHATSAPP_FROM || '',
  },

  PAYMENT: {
    PROVIDER: process.env.PAYMENT_PROVIDER || '',
    SECRET_KEY: process.env.PAYMENT_SECRET_KEY || '',
    PUBLIC_KEY: process.env.PAYMENT_PUBLIC_KEY || '',
    WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || '',
  },

  PUSH: {
    PUBLIC_KEY: process.env.PUSH_PUBLIC_KEY || '',
    PRIVATE_KEY: process.env.PUSH_PRIVATE_KEY || '',
    SUBJECT: process.env.PUSH_SUBJECT || 'mailto:admin@example.com',
  },

  PATHS: {
    ROOT: path.join(__dirname, '..', '..'),
    SERVER: path.join(__dirname, '..'),
    INSTALL_LOCK_FILE: path.join(__dirname, '..', '..', '.installed'),
    SCHEMA_SQL: path.join(__dirname, '..', '..', 'database', 'schema.sql'),
    SEED_SQL: path.join(__dirname, '..', '..', 'database', 'seed.sql'),
    CLIENT_DIST: path.join(__dirname, '..', '..', 'client', 'dist'),
    INSTALL_PUBLIC: path.join(__dirname, '..', '..', 'install', 'public'),
  },
};

module.exports = env;
