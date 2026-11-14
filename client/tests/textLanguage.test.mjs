import test from 'node:test';
import assert from 'node:assert/strict';
import { textLanguage, needsTranslation } from '../src/utils/textLanguage.js';

test('a request is translated only for a reader of another language (AYK-229)', () => {
  assert.equal(textLanguage('تسريب مياه في المطبخ'), 'ar');
  assert.equal(textLanguage('پانی کا رساؤ'), 'ur');
  assert.equal(textLanguage('পানি পড়ছে'), 'bn');
  assert.equal(textLanguage('Water leak'), 'latin');
  assert.equal(textLanguage('123 !!'), '');
  assert.equal(needsTranslation('تسريب مياه', 'ar'), false);
  assert.equal(needsTranslation('تسريب مياه', 'ur'), true);
  assert.equal(needsTranslation('تسريب مياه', 'en'), true);
  assert.equal(needsTranslation('Water leak', 'en'), false);
  assert.equal(needsTranslation('Water leak', 'ar'), true);
  assert.equal(needsTranslation('123', 'en'), false);
});
