const test = require('node:test');
const assert = require('node:assert');
const { freshCertificateUrl, certificateLink, resetCache, INQUIRY } = require('../services/sbcSeal');

const SEAL = '<div class="sbc-card"><a class="sbc-link" href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000338868?vt=1.WGT.1795485382.abc&amp;x=1" target="_blank">عرض التحقق</a></div>';

test('AYK-474: the certificate link is read from the seal, only for this certificate', () => {
  assert.equal(certificateLink(SEAL), 'https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000338868?vt=1.WGT.1795485382.abc&x=1');
  assert.equal(certificateLink(SEAL.replace('0000338868', '0000313633')), '', 'another store\'s certificate is never used');
  assert.equal(certificateLink('<html></html>'), '');
});

test('AYK-474: a fresh link is fetched with the store\'s seal code and kept ten minutes; the inquiry page when the centre fails', async () => {
  resetCache();
  let calls = 0; let asked = '';
  const ok = async (url) => { calls += 1; asked = url; return { ok: true, text: async () => SEAL }; };
  const url = await freshCertificateUrl({ fetchImpl: ok, now: 1000 });
  assert.match(url, /certificate-details\/0000338868\?vt=/);
  assert.match(asked, /EAuthSealApi\/seal\?token=QkgzZE9CcXdpcWsvaUUyY1JjZ3BvQT09&lang=ar/);
  await freshCertificateUrl({ fetchImpl: ok, now: 1000 + 9 * 60 * 1000 });
  assert.equal(calls, 1, 'reused within ten minutes');
  await freshCertificateUrl({ fetchImpl: ok, now: 1000 + 11 * 60 * 1000 });
  assert.equal(calls, 2, 'fetched again after ten minutes');
  resetCache();
  assert.equal(await freshCertificateUrl({ fetchImpl: async () => { throw new Error('down'); } }), INQUIRY);
  resetCache();
  assert.equal(await freshCertificateUrl({ fetchImpl: async () => ({ ok: false, text: async () => '' }) }), INQUIRY);
});
