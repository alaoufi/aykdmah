const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// AYK-138: iPhone notifications straight to Apple (APNs).
const fresh = () => {
  delete require.cache[require.resolve('../services/apnsService')];
  return require('../services/apnsService');
};

test('an Apple device token is 64 hex characters; an Android one is not', () => {
  const apns = fresh();
  assert.equal(apns.isAppleToken('a1'.repeat(32)), true);
  assert.equal(apns.isAppleToken('cZ1:APA91b' + 'x'.repeat(40)), false);
  assert.equal(apns.isAppleToken(''), false);
});

test('silent until the APNs key is configured', async () => {
  for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY', 'APNS_BUNDLE_ID']) delete process.env[key];
  const apns = fresh();
  assert.equal(apns.isConfigured(), false);
  assert.equal(await apns.send(['a1'.repeat(32)], { kind: 'message', title: 'x', body: 'y' }), 0);
});

test('configured with a P-256 key; nothing to show sends nothing', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  Object.assign(process.env, {
    APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM123', APNS_BUNDLE_ID: 'sa.aykdmh.app',
    APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  const apns = fresh();
  assert.equal(apns.isConfigured(), true);
  // "Call ended" has no title: no network request at all.
  assert.equal(await apns.send(['a1'.repeat(32)], { kind: 'call_end', call_id: 1 }), 0);
  for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY', 'APNS_BUNDLE_ID']) delete process.env[key];
});
