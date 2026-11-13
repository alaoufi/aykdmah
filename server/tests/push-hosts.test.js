// Which browser push services a device subscription may point to (AYK-056).
const test = require('node:test');
const assert = require('node:assert/strict');
const { validSubscription } = require('../services/pushService');

const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const at = endpoint => validSubscription({ endpoint, keys });

test('Chrome, Firefox, Safari and Edge push hosts are accepted', () => {
  for (const host of ['fcm.googleapis.com', 'jmt17.google.com', 'android.googleapis.com', 'updates.push.services.mozilla.com',
    'web.push.apple.com', 'wns2-par02p.notify.windows.com']) {
    assert.ok(at(`https://${host}/fcm/send/device-1`), host);
  }
});

test('other hosts, plain http, ports and missing keys are refused', () => {
  assert.equal(at('https://evil.example/push'), false);
  assert.equal(at('https://google.com.evil.example/push'), false);
  assert.equal(at('http://fcm.googleapis.com/x'), false);
  assert.equal(at('https://fcm.googleapis.com:8443/x'), false);
  assert.equal(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: {} }), false);
});
