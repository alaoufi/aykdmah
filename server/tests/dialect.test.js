// AYK-420: the server learns with the same spelling rules the page understands with.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const dialect = require('../services/dialectLearning');

test('server and page normalize and cut words the same way', async () => {
  const page = await import(pathToFileURL(path.join(__dirname, '../../client/src/utils/requestIntent.mjs')).href);
  for (const text of ['أُريدُ إنارةً ٣ في المجلس', 'المكيفات والمكيف ما يبرد', 'تسريب بالمطبخ وللحمام', 'ستائر الصالة']) {
    assert.equal(dialect.normalizeArabic(text), page.normalizeArabic(text));
    for (const word of page.normalizeArabic(text).split(' ')) assert.equal(dialect.stem(word), page.stem(word));
  }
});

test('learning keeps roots only: no numbers, no small or request words', () => {
  const terms = dialect.termsOf('أبي سباك اليوم في حي النرجس، فيه تهريب تحت المغسلة ٠٥٥١٢٣٤٥٦٧ ضروري');
  assert.deepEqual(terms.sort(), ['تحت', 'تهريب', 'سباك', 'مغسل', 'نرجس'].sort());
  assert.ok(!terms.some(t => /\d/.test(t)));
});

test('a learned word adds to the profession the page chooses', async () => {
  const page = await import(pathToFileURL(path.join(__dirname, '../../client/src/utils/requestIntent.mjs')).href);
  const categories = [{ id: 1, slug: 'cars', name_ar: 'سيارات' }, { id: 2, slug: 'electrical', name_ar: 'كهرباء' }];
  const before = page.understandRequest('الدينمو خربان', { categories, services: [] });
  assert.equal(before.category, null);
  const after = page.understandRequest('الدينمو خربان', { categories, services: [], learned: [{ term: 'دينمو', category_id: 1, service_id: null }] });
  assert.equal(after.category?.id, 1);
});
