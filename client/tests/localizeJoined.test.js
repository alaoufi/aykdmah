import test from 'node:test';
import assert from 'node:assert/strict';
import { localizedJoinedName } from '../src/utils/localizeJoined.js';

test('joined request labels follow a language change without replacing user content', () => {
  const request = {
    title: 'إصلاح صنابير بيتي',
    category_name: 'سباكة',
    category_name_en: 'Plumbing',
    category_name_translations: { ar: 'سباكة', en: 'Plumbing', ur: 'پلمبنگ', hi: 'प्लंबिंग', bn: 'প্লাম্বিং' },
    city_name: 'مدينة مخصصة', city_name_en: 'Custom city',
  };
  for (const language of ['ar', 'en', 'ur', 'hi', 'bn']) {
    assert.equal(localizedJoinedName(request, 'category', language), request.category_name_translations[language]);
  }
  assert.equal(localizedJoinedName(request, 'city', 'en'), 'Custom city');
  assert.equal(request.title, 'إصلاح صنابير بيتي');
  assert.equal(localizedJoinedName(request, 'missing', 'hi'), '');
  assert.equal(localizedJoinedName(null, 'category', 'hi'), '');
});
