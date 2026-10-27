const env = require('../config/env');

const UNAVAILABLE_MESSAGE = 'الدفع الإلكتروني غير مفعّل حاليًا. لن يتم تحصيل أي مبلغ؛ يلزم ربط بوابة دفع فعلية قبل تفعيل الاشتراكات المدفوعة.';

// Test mode (PAYMENT_PROVIDER=test): the whole checkout flow runs on an internal
// page and no money moves. Live gateways get their own adapter later; test mode
// must be switched off (and test data cleared) before any real collection.
const isTestMode = () => (env.PAYMENT.PROVIDER || '').trim().toLowerCase() === 'test';

function getAvailability() {
  const provider = (env.PAYMENT.PROVIDER || '').trim().toLowerCase();
  if (provider === 'test') return { ready: true, provider: 'test', test: true };
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

class TestAdapter extends PaymentAdapter {
  async createSession({ metadata }) {
    const transaction = `test_${require('crypto').randomUUID()}`;
    return { ok: true, test: true, transaction_id: transaction,
      checkout_url: `${env.APP_URL.replace(/\/+$/, '')}/payments/test/${metadata.payment_id}` };
  }
  // Test payments are settled by the owner's own confirmation (see paymentController), never by webhook.
  async verifyWebhook() { return { ok: false }; }
  async refund() { return { ok: false }; }
}

function getAdapter() {
  return isTestMode() ? new TestAdapter() : new UnavailableAdapter();
}

async function createCheckoutSession(opts) { return getAdapter().createSession(opts); }
async function verifyWebhook(payload, headers) { return getAdapter().verifyWebhook(payload, headers); }
async function refund(opts) { return getAdapter().refund(opts); }

module.exports = { createCheckoutSession, verifyWebhook, refund, getAvailability, isTestMode };
