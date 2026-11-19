// Nafath adapters.
//
// Real Nafath is a Saudi national-identity service requiring an
// onboarding agreement and access to a sandbox. The flow is:
//   1) start(nationalId)            → returns transactionId + random code
//   2) user opens Nafath app, picks the matching code
//   3) we poll status(transactionId) or receive a callback
//
// `nafath_api` here is a placeholder that hits a configurable endpoint
// (so admins can plug in their actual integration partner). `mock`
// simulates the round-trip for local development.
const { gatewayRequest } = require('../../utils/integrationHttp');
const { randomUUID, randomInt } = require('crypto');

async function nafathApiStart({ credentials, config, nationalId }) {
  const baseUrl = credentials.base_url || config?.base_url;
  const clientId = credentials.client_id;
  const secret   = credentials.client_secret;
  if (!baseUrl || !clientId || !secret) throw new Error('missing nafath credentials');

  const r = await gatewayRequest(baseUrl, '/identity/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
      'X-Client-Secret': secret,
    },
    body: JSON.stringify({ id: nationalId }),
  });
  if (!r.ok) throw new Error(`nafath:${r.status}`);
  const data = await r.json();
  return { transactionId: data.transactionId, code: data.code };
}

async function nafathApiStatus({ credentials, config, transactionId }) {
  const baseUrl = credentials.base_url || config?.base_url;
  const clientId = credentials.client_id;
  const secret   = credentials.client_secret;
  const r = await gatewayRequest(baseUrl, `/identity/status/${encodeURIComponent(transactionId)}`, {
    headers: { 'X-Client-Id': clientId, 'X-Client-Secret': secret },
  });
  if (!r.ok) throw new Error(`nafath:${r.status}`);
  return r.json();   // { status: 'pending'|'approved'|'rejected', name?, dob? }
}

async function mockStart({ nationalId }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development adapter disabled');
  return {
    transactionId: `mock-${randomUUID()}`,
    code: String(randomInt(10, 100)),
  };
}

async function mockStatus() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development adapter disabled');
  return { status: 'approved', name: 'Mock User' };
}

module.exports = {
  nafath_api: {
    label: 'Nafath API (custom endpoint)',
    description: 'Generic Nafath gateway — plug in your integrator base URL',
    fields: [
      { key: 'base_url',      label: 'Base URL',      required: true },
      { key: 'client_id',     label: 'Client ID',     required: true },
      { key: 'client_secret', label: 'Client Secret', required: true, sensitive: true },
    ],
    config_fields: [
      { key: 'base_url', label: 'Base URL fallback' },
    ],
    start:  nafathApiStart,
    status: nafathApiStatus,
  },
  mock: {
    label: 'Mock (dev only)',
    description: 'Returns a fake transaction id + 2-digit code',
    fields: [],
    config_fields: [],
    start:  mockStart,
    status: mockStatus,
  },
};
