const test = require('node:test');
const assert = require('node:assert/strict');
const { localeMiddleware, translate } = require('../utils/i18n');

// AYK-313: refusals written from MESSAGES are marked so the site can show their reason.
function run(lang, handler) {
  const req = { headers: { 'accept-language': lang } };
  let sent;
  const res = { json: body => { sent = body; return body; } };
  localeMiddleware(req, res, () => {});
  handler(req, res);
  return sent;
}

test('a refusal from req.t is marked localized; a raw message is not', () => {
  assert.deepEqual(run('tr', (req, res) => res.json({ success: false, message: req.t('provider_not_engaged') })),
    { success: false, message: translate('tr', 'provider_not_engaged'), localized: true });
  assert.equal(run('ar', (req, res) => res.json({ success: false, message: 'some internal text' })).localized, undefined);
  assert.equal(run('ar', (req, res) => res.json({ success: true, message: req.t('review_sent') })).localized, undefined);
});

test('a thrown key (ApiError) is translated into the reader language and keeps its code', () => {
  const body = run('ur', (req, res) => res.json({ success: false, message: 'must_complete_first' }));
  assert.deepEqual(body, { success: false, code: 'must_complete_first', message: translate('ur', 'must_complete_first'), localized: true });
});
