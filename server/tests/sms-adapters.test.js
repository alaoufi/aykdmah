// Saudi SMS adapters (AYK-016): request format, number format and allowed hosts.
// The network is replaced with a recorder, so no message is ever sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('../services/integrations/sms');
const integrations = require('../services/integrations');

function recordFetch(response = { status: 201, body: { messageId: 77 } }) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { global.fetch = original; } };
}

test('Taqnyat sends a Bearer request with a 966 number, to the default or the owner-configured host', async () => {
  const net = recordFetch();
  try {
    const result = await sms.taqnyat.send({ credentials: { token: 'test-token', sender: 'Sender' }, config: {}, to: '0551234567', message: 'رمز 1234' });
    assert.equal(result.provider_id, '77');
    assert.equal(net.calls[0].url, 'https://api.taqnyat.sa/v1/messages');
    assert.equal(net.calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(net.calls[0].options.body), { recipients: ['966551234567'], body: 'رمز 1234', sender: 'Sender' });

    const url = 'https://api-sms.4jawaly.com/api/v1/account/area/sms/send';
    await sms.taqnyat.send({ credentials: { token: 't', sender: 'S', api_url: url }, config: {}, to: '+966 55 123 4567', message: 'm' });
    assert.equal(net.calls[1].url, url);
    assert.deepEqual(JSON.parse(net.calls[1].options.body).recipients, ['966551234567']);
  } finally { net.restore(); }
});

test('4jawaly sends Basic auth and its messages format', async () => {
  const net = recordFetch({ status: 200, body: { code: 200, job_id: 'j1' } });
  try {
    const result = await sms['4jawaly'].send({ credentials: { app_key: 'k', app_secret: 's', sender: 'S' }, config: {}, to: '00966551234567', message: 'm' });
    assert.equal(result.provider_id, 'j1');
    assert.equal(net.calls[0].options.headers.Authorization, 'Basic ' + Buffer.from('k:s').toString('base64'));
    assert.deepEqual(JSON.parse(net.calls[0].options.body), { messages: [{ text: 'm', numbers: ['966551234567'], sender: 'S' }] });
  } finally { net.restore(); }
});

test('a stored secret is never sent to another host, and saving such a URL is refused', async () => {
  const net = recordFetch();
  try {
    for (const api_url of ['https://evil.example.com/v1/messages', 'http://api.taqnyat.sa/v1/messages', 'https://api.taqnyat.sa:8443/v1/messages']) {
      await assert.rejects(sms.taqnyat.send({ credentials: { token: 't', sender: 'S', api_url }, config: {}, to: '0551234567', message: 'm' }));
      assert.throws(() => integrations.validateIntegration('sms', 'taqnyat', { credentials: { api_url } }), error => error.status === 400);
    }
    assert.throws(() => integrations.validateIntegration('sms', '4jawaly', { credentials: { api_url: 'https://api.taqnyat.sa/v1/messages' } }), error => error.status === 400);
    await assert.rejects(sms.taqnyat.send({ credentials: { sender: 'S' }, config: {}, to: '0551234567', message: 'm' }), /missing/);
    await assert.rejects(sms.taqnyat.send({ credentials: { token: 't', sender: 'S' }, config: {}, to: '12', message: 'm' }), /invalid phone/);
    assert.equal(net.calls.length, 0);
  } finally { net.restore(); }
});
