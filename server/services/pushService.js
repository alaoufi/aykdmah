const webpush = require('web-push');
const env = require('../config/env');
const logger = require('../utils/logger');
const PushSubscription = require('../models/PushSubscription');

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

// Only the browsers' own push services are accepted, so a stored endpoint can
// never make the server send requests to an arbitrary host.
// jmt17.google.com: Chrome on Android hands out this Google push host too (seen 2026-10-30,
// it was rejected and the owner's phone never got notifications); android.googleapis.com: older Chrome.
const HOSTS = ['fcm.googleapis.com', 'jmt17.google.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const HOST_SUFFIXES = ['.notify.windows.com', '.wns.windows.com', '.push.apple.com'];
function validSubscription(subscription) {
  let endpoint;
  try { endpoint = new URL(subscription?.endpoint); } catch (_) { return false; }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port) return false;
  if (String(subscription.endpoint).length > 700) return false;
  if (!HOSTS.includes(endpoint.hostname) && !HOST_SUFFIXES.some(s => endpoint.hostname.endsWith(s))) return false;
  const { p256dh, auth } = subscription.keys || {};
  return typeof p256dh === 'string' && /^[A-Za-z0-9_-]{40,200}$/.test(p256dh)
    && typeof auth === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(auth);
}

async function send(subscription, payload, options = {}) {
  if (!validSubscription(subscription)) return { sent: false, reason: 'invalid_subscription' };
  if (!configure()) return { sent: false, reason: 'not_configured' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60, ...options });
    return { sent: true };
  } catch (err) {
    // 404/410: the browser dropped this subscription (permission revoked, app removed).
    if ([404, 410].includes(err.statusCode)) return { sent: false, reason: 'gone' };
    logger.warn('Push send failed:', err.statusCode || err.message);
    return { sent: false, reason: 'delivery_failed' };
  }
}

// Sends to every device of a user; payload may be a function of the device language.
async function sendToUser(userId, payload, options) {
  if (!configure()) return 0;
  const subscriptions = await PushSubscription.listForUser(userId);
  let sent = 0;
  await Promise.all(subscriptions.map(async sub => {
    const result = await send(sub, typeof payload === 'function' ? payload(sub.lang) : payload, options);
    if (result.sent) sent += 1;
    else if (result.reason === 'gone' || result.reason === 'invalid_subscription') await PushSubscription.removeEndpoint(sub.endpoint).catch(() => {});
  }));
  return sent;
}

function getPublicKey() {
  return env.PUSH.PUBLIC_KEY || null;
}

module.exports = { send, sendToUser, validSubscription, getPublicKey, configure };
