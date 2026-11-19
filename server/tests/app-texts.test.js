// The Android app's own texts come from the site (AYK-310): every language has every text, each
// within what the app accepts (AppTexts.java: names of letters, values up to 200 characters).
const test = require('node:test');
const assert = require('node:assert/strict');
const { appTexts, APP_TEXTS, SUPPORTED } = require('../utils/i18n');

test('every app text exists in all 11 languages and fits what the app accepts', () => {
  for (const [key, values] of Object.entries(APP_TEXTS)) {
    assert.match(key, /^[A-Za-z]{1,40}$/);
    for (const lang of SUPPORTED) {
      assert.ok(values[lang] && values[lang].trim(), `${key} missing in ${lang}`);
      assert.ok(values[lang].length <= 200, `${key} too long in ${lang}`);
    }
  }
  assert.equal(Object.keys(APP_TEXTS).length, 12);
});

test('texts follow the language asked, with Arabic for an unknown one, and stay small enough for a push', () => {
  assert.equal(appTexts('ur').callAnswer, 'جواب دیں');
  assert.equal(appTexts('tr').callDecline, 'Reddet');
  assert.equal(appTexts('xx').callAnswer, 'رد');
  for (const lang of SUPPORTED) assert.ok(Buffer.byteLength(JSON.stringify(appTexts(lang))) < 1500, lang);
});
