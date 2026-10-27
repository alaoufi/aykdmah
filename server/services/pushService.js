const webpush = require('web-push');
const env = require('../config/env');
const logger = require('../utils/logger');

let configured = false;

function configure() {
  if (configured) return true;
  if (!env.PUSH.PUBLIC_KEY || !env.PUSH.PRIVATE_KEY) {
    logger.warn('Web Push VAPID keys not configured');
    return false;
  }
  try {
    webpush.setVapidDetails(env.PUSH.SUBJECT, env.PUSH.PUBLIC_KEY, env.PUSH.PRIVATE_KEY);
    configured = true;
    return true;
  } catch (err) {
    logger.error('Web Push configuration failed:', err.message);
    return false;
  }
}

async function send(subscription, payload) {
  let endpoint;
  try { endpoint = new URL(subscription?.endpoint); } catch (_) { return { sent: false, reason: 'invalid_subscription' }; }
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns.windows.com'];
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port
      || !hosts.some(host => endpoint.hostname === host || (host === 'wns.windows.com' && endpoint.hostname.endsWith('.wns.windows.com')))) {
    return { sent: false, reason: 'invalid_subscription' };
  }
  if (!configure()) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { sent: true };
  } catch (err) {
    logger.error('Push send failed');
    return { sent: false, reason: 'delivery_failed' };
  }
}

function getPublicKey() {
  return env.PUSH.PUBLIC_KEY || null;
}

module.exports = { send, getPublicKey, configure };
