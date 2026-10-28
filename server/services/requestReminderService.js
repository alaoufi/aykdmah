// "Did you find someone?" reminders: an open request is not left hanging. An hour
// after posting, then once a day while it stays open, the requester is asked whether
// it is still needed; the request page lets them close it or stop the reminders.
const { query } = require('../config/database');
const notificationService = require('./notificationService');
const pushService = require('./pushService');
const PushSubscription = require('../models/PushSubscription');
const { translate } = require('../utils/i18n');
const logger = require('../utils/logger');

const DAY = 24 * 60 * 60 * 1000;
const EVERY = 5 * 60 * 1000;

async function remindDue(now = new Date()) {
  const due = await query(
    `SELECT id, client_id, title FROM requests
      WHERE status = 'open' AND deleted_at IS NULL AND reminders_off = 0
        AND remind_at IS NOT NULL AND remind_at <= ?
      ORDER BY remind_at LIMIT 100`, [now]);
  let sent = 0;
  for (const request of due) {
    // Claim the row first so two app instances never send the same reminder.
    const claimed = await query('UPDATE requests SET remind_at = ? WHERE id = ? AND remind_at <= ?',
      [new Date(now.getTime() + DAY), request.id, now]);
    if (!claimed.affectedRows) continue;
    const subs = await PushSubscription.listForUser(request.client_id).catch(() => []);
    const lang = subs[0]?.lang || 'ar';
    const text = l => ({
      title: translate(l, 'request_reminder_title'),
      body: translate(l, 'request_reminder_body', { title: request.title }),
    });
    const link = `/requests/${request.id}`;
    await notificationService.notifyUser(request.client_id, { type: 'request_reminder', ...text(lang), link, data: { request_id: request.id } });
    await pushService.sendToUser(request.client_id, l => ({ ...text(l), url: link, tag: `request-${request.id}`, kind: 'request_reminder' }))
      .catch(err => logger.warn('Request reminder push failed:', err.message));
    sent += 1;
  }
  return sent;
}

let timer = null;
function start() {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(() => { remindDue().catch(err => logger.warn('Request reminders failed:', err.message)); }, EVERY);
  timer.unref();
}

module.exports = { remindDue, start };
