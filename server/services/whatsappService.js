const env = require('../config/env');
const logger = require('../utils/logger');

async function send({ to, message, template, params }) {
  if (!env.WHATSAPP.PROVIDER || !env.WHATSAPP.TOKEN) {
    logger.warn('WhatsApp delivery skipped: not configured');
    return { sent: false, reason: 'not_configured' };
  }

  switch ((env.WHATSAPP.PROVIDER || '').toLowerCase()) {
    case 'twilio':
      return sendViaTwilio({ to, message });
    case 'meta':
      return sendViaMeta({ to, message, template, params });
    default:
      logger.warn(`Unknown WhatsApp provider: ${env.WHATSAPP.PROVIDER}`);
      return { sent: false, reason: 'unknown_provider' };
  }
}

async function sendViaTwilio({ to, message }) {
  logger.info('WhatsApp Twilio adapter is not configured');
  return { sent: false, reason: 'adapter_not_wired' };
}

async function sendViaMeta({ to, message, template }) {
  logger.info('WhatsApp Meta adapter is not configured');
  return { sent: false, reason: 'adapter_not_wired' };
}

module.exports = { send };
