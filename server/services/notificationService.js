const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const pushService = require('./pushService');
const logger = require('../utils/logger');
const { emitUser } = require('../utils/conversationEvents');

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let io = null;
function setIo(ioInstance) { io = ioInstance; }

// Notices that also reach the phone, even with the app closed (AYK-078). Messages and calls
// have their own phone notification and are not repeated here.
const PHONE_TYPES = new Set([
  'request_new', 'request_contact', 'new_offer', 'offer_accepted', 'offer_rejected', 'request_withdrawn',
  'request_completed', 'request_reminder', 'request_warranty', 'admin_assigned', 'new_review', 'support_reply', 'support_new',
  'dispute_opened', 'dispute_message', 'dispute_status', 'dispute_resolved',
]);

function pushNotice(userId, notification, { type, title, body, link, data }) {
  const key = data && (data.request_id || data.conversation_id || data.dispute_id || data.ticket_id);
  pushService.sendToUser(userId, {
    kind: 'notice', tag: `n-${type}-${key || notification.id}`,
    url: typeof link === 'string' && link.startsWith('/') ? link : '/notifications',
    title, body: body || '',
  }, { TTL: 24 * 60 * 60, urgency: 'high' })
    .then(sent => logger.info(`Push notice type=${type} user=${userId} devices=${sent}`))
    .catch(err => logger.warn('Notice push failed:', err.message));
}

async function notifyUser(userId, { type, title, body, data, link, channels = ['in_app'] }) {
  try {
    const notification = await Notification.create({
      user_id: userId, type, title, body, data, link, channel: 'in_app',
    });

    if (io && channels.includes('in_app')) {
      await emitUser(io, userId, 'notification:new', notification);
    }
    if (PHONE_TYPES.has(type)) pushNotice(userId, notification, { type, title, body, link, data });

    if (channels.includes('email')) {
      const user = await User.findById(userId);
      if (user && user.email) {
        emailService.send({
          to: user.email, subject: title,
          html: `<div dir="rtl" style="font-family:Tahoma,Arial"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>`,
          text: body || title,
        }).catch(err => logger.warn('Email notify failed:', err.message));
      }
    }

    if (channels.includes('whatsapp')) {
      const user = await User.findById(userId);
      if (user && user.phone) {
        whatsappService.send({
          to: user.phone,
          message: `${title}\n${body || ''}`,
        }).catch(err => logger.warn('WhatsApp notify failed:', err.message));
      }
    }

    return notification;
  } catch (err) {
    logger.error('notifyUser failed');
    return null;
  }
}

async function broadcast(userIds, payload) {
  return Promise.all(userIds.map(uid => notifyUser(uid, payload)));
}

module.exports = { setIo, notifyUser, broadcast, PHONE_TYPES };
