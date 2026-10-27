const env = require('../config/env');

const UNAVAILABLE_MESSAGE = 'الدفع الإلكتروني غير مفعّل حاليًا. لن يتم تحصيل أي مبلغ؛ يلزم ربط بوابة دفع فعلية قبل تفعيل الاشتراكات المدفوعة.';

function getAvailability() {
  const provider = (env.PAYMENT.PROVIDER || '').trim().toLowerCase();
  // There is no implemented, authenticated payment adapter. Never issue a
  // successful checkout or accept a webhook in any environment.
  return { ready: false, provider: provider || null, reason: 'payment_not_configured', message: UNAVAILABLE_MESSAGE };
}

class PaymentAdapter {
  async createSession() { throw new Error('Not implemented'); }
  async verifyWebhook() { throw new Error('Not implemented'); }
  async refund() { throw new Error('Not implemented'); }
}

class UnavailableAdapter extends PaymentAdapter {
  unavailable() { return { ok: false, ...getAvailability() }; }
  async createSession() { return this.unavailable(); }
  async verifyWebhook() { return this.unavailable(); }
  async refund() { return this.unavailable(); }
}

function getAdapter() {
  return new UnavailableAdapter();
}

async function createCheckoutSession(opts) { return getAdapter().createSession(opts); }
async function verifyWebhook(payload, headers) { return getAdapter().verifyWebhook(payload, headers); }
async function refund(opts) { return getAdapter().refund(opts); }

module.exports = { createCheckoutSession, verifyWebhook, refund, getAvailability };
