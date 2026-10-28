const test = require('node:test');
const assert = require('node:assert/strict');
const { translate, SUPPORTED } = require('../utils/i18n');

// These values are legal user-written strings. JavaScript replacement-string
// directives must remain text when interpolating platform notifications.
const values = ["Worker $& $' $` $$", "محمد $&", "नाम $'", "নাম $`"];

test('notification interpolation preserves literal user values in all supported languages', () => {
  for (const language of SUPPORTED) {
    const template = translate(language, 'notif_new_offer_body');
    for (const name of values) {
      const expected = template.replace(/\{\{name\}\}/g, () => name).replace(/\{\{price\}\}/g, () => '40.50');
      const result = translate(language, 'notif_new_offer_body', { name, price: '40.50' });
      assert.equal(result, expected, language);
      assert.ok(result.includes(name));
      assert.ok(result.includes('40.50'));
      assert.equal(translate(language, 'notif_offer_accepted_body', { title: name }),
        translate(language, 'notif_offer_accepted_body').replace(/\{\{title\}\}/g, () => name));
    }
    assert.equal(translate(language, 'notif_new_offer_body', { name: 'Worker', price: 0 }),
      template.replace(/\{\{name\}\}/g, () => 'Worker').replace(/\{\{price\}\}/g, () => '0'));
  }
});

test('interpolation retains established missing-key and language fallbacks', () => {
  assert.equal(translate('unknown', 'notif_new_offer_body', { name: values[0], price: 40 }),
    translate('en', 'notif_new_offer_body', { name: values[0], price: 40 }));
  assert.equal(translate('ar', 'missing_key', { name: values[0] }), 'missing_key');
  assert.equal(translate('ar', 'notif_new_offer_body'), 'قدم {{name}} عرضاً بقيمة {{price}}');
});

test('account completion and saved-location guidance has native text in all five languages', () => {
  const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u,
    ml: /[\u0d00-\u0d7f]/u, fil: /[a-z]/iu, id: /[a-z]/iu, ne: /[\u0900-\u097f]/u, am: /[\u1200-\u137f]/u, tr: /[a-z\u00e7\u011f\u0131\u00f6\u015f\u00fc]/iu };
  for (const key of ['account_phone_unavailable', 'account_profile_required', 'account_location_required']) {
    for (const language of SUPPORTED) {
      const message = translate(language, key);
      assert.notEqual(message, key);
      assert.match(message, scripts[language]);
      if (language !== 'en') assert.notEqual(message, translate('en', key));
    }
  }
});
