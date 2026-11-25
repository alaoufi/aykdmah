const env = require('../config/env');

function ts() {
  return new Date().toISOString();
}

// Line breaks in user-supplied text could forge extra log lines (CodeQL js/log-injection, AYK-500).
const oneLine = text => text.replace(/[\r\n\u2028\u2029]+/g, ' \u23ce ');

function safe(arg) {
  if (typeof arg === 'string') return oneLine(arg);
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
      return oneLine(String(arg));
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
