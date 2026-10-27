const env = require('../config/env');

function ts() {
  return new Date().toISOString();
}

function safe(arg) {
  if (arg instanceof Error) return env.NODE_ENV === 'production'
    ? { name: arg.name, code: arg.code || null, status: arg.status || null }
    : arg.stack || arg.message;
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg, (key, value) => {
        if (/password|token|secret|authorization|credential|cookie|database_url|national.?id|otp/i.test(String(key))) {
          return '[REDACTED]';
        }
        return value;
      });
    } catch (_) {
      return String(arg);
    }
  }
  return arg;
}

const logger = {
  info: (...args) => console.log(`[${ts()}] [INFO]`, ...args.map(safe)),
  warn: (...args) => console.warn(`[${ts()}] [WARN]`, ...args.map(safe)),
  error: (...args) => console.error(`[${ts()}] [ERROR]`, ...args.map(safe)),
  debug: (...args) => {
    if (env.NODE_ENV !== 'production') {
      console.debug(`[${ts()}] [DEBUG]`, ...args.map(safe));
    }
  },
};

module.exports = logger;
