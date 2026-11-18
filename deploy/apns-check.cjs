// Asks Apple whether an APNs key is accepted, without notifying anyone (AYK-269): it sends one
// push to a device token that cannot exist. Apple then answers 400 BadDeviceToken when the key,
// key id and team id are right, and 403 InvalidProviderToken (or similar) when they are not.
// Reads APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID and APNS_KEY (\n-escaped) from the environment.
// Prints one line, never the key. Used by deploy/apns-setup.sh.
const http2 = require('node:http2');
const crypto = require('node:crypto');
const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_BUNDLE_ID: bundleId = 'sa.aykdmh.app' } = process.env;
const key = String(process.env.APNS_KEY || '').replace(/\\n/g, '\n');
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat: Math.floor(Date.now() / 1000) })}`;
let jwt;
try {
  jwt = `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
} catch (err) { console.log(`NOT READY: the key file is not a valid APNs key (${err.code || 'unreadable'})`); process.exit(1); }
const session = http2.connect(process.env.APNS_HOST || 'https://api.push.apple.com');
session.on('error', err => { console.log(`NOT READY: Apple could not be reached (${err.code || err.message})`); process.exit(1); });
const req = session.request({ ':method': 'POST', ':path': `/3/device/${'0'.repeat(64)}`, authorization: `bearer ${jwt}`,
  'apns-topic': bundleId, 'apns-push-type': 'alert', 'apns-expiration': '0', 'content-type': 'application/json' });
let status = 0, text = '';
req.setTimeout(15000, () => { console.log('NOT READY: Apple did not answer in time'); process.exit(1); });
req.on('response', h => { status = h[':status']; });
req.on('data', c => { text += c; });
req.on('end', () => {
  let reason = ''; try { reason = JSON.parse(text).reason || ''; } catch (_) { /* empty */ }
  session.close();
  if (status === 400 && reason === 'BadDeviceToken') { console.log('OK   Apple accepts this key, key id and team id'); process.exit(0); }
  const why = { InvalidProviderToken: 'the key, its Key ID or the Team ID do not match', TopicDisallowed: `the key may not send for ${bundleId}`, BadTopic: `the bundle id ${bundleId} is wrong` }[reason];
  console.log(`NOT READY: Apple refused (${status} ${reason})${why ? `: ${why}` : ''}`);
  process.exit(1);
});
req.end(JSON.stringify({ aps: { alert: 'check' } }));
