const logger = require('../utils/logger');
const env = require('../config/env');

function notFoundHandler(req, res, next) {
  res.status(404).json({ success: false, message: req.t('route_not_found') });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const inputCodes = new Set(['22P02', '22001', '22003', '23502', '23503', '23514']);
  const databaseStatus = err.code === '23505' ? 409 : inputCodes.has(err.code) ? 400 : null;
  const candidate = Number(err.status || err.statusCode || databaseStatus || 500);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  const message = err.message === 'verification_required' && status === 403 ? req.t('verification_required')
    : databaseStatus ? req.t('invalid_data') : status >= 500 && env.NODE_ENV === 'production'
    ? req.t('server_error') : err.message || req.t('server_error');

  logger.error(`${req.method} ${req.path}`, err);

  const body = { success: false, message };
  if (err.errors && status < 500) body.errors = err.errors;
  if (env.NODE_ENV !== 'production' && status >= 500) {
    body.stack = err.stack;
  }
  res.status(status).json(body);
}

class ApiError extends Error {
  constructor(message, status = 400, errors = null) {
    super(message);
    this.status = status;
    if (errors) this.errors = errors;
  }
}

module.exports = { notFoundHandler, errorHandler, ApiError };
