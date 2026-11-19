const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.MAIL.HOST || !env.MAIL.USER) {
    logger.warn('Email service not configured');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.MAIL.HOST,
    port: env.MAIL.PORT,
    secure: env.MAIL.PORT === 465,
    auth: { user: env.MAIL.USER, pass: env.MAIL.PASSWORD },
  });
  return transporter;
}

async function send({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    logger.warn('Email delivery skipped: not configured');
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const info = await t.sendMail({
      from: env.MAIL.FROM || env.MAIL.USER,
      to, subject, html, text,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Email send failed');
    return { sent: false, reason: 'delivery_failed' };
  }
}

module.exports = { send };
