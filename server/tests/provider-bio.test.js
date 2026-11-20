// AYK-377: the provider's description in the reader's language, never an outdated translation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bioFor, BIO_LIST_MAX } = require('../utils/providerBio');

const ar = 'كهربائي بخبرة عشر سنوات';
const map = { ar, en: 'Electrician with ten years of experience' };

test('the reader gets their language next to the original', () => {
  assert.deepEqual(bioFor({ bio: ar, bio_translations: map }, 'en'), { bio: ar, bio_translated: map.en });
  assert.deepEqual(bioFor({ bio: ar, bio_translations: JSON.stringify(map) }, 'en'), { bio: ar, bio_translated: map.en });
});

test('same language, no translation yet, or no description', () => {
  assert.deepEqual(bioFor({ bio: ar, bio_translations: map }, 'ar'), { bio: ar });
  assert.deepEqual(bioFor({ bio: ar, bio_translations: map }, 'tr'), { bio: ar });
  assert.deepEqual(bioFor({ bio: ar, bio_translations: null }, 'en'), { bio: ar });
  assert.deepEqual(bioFor({ bio: '  ', bio_translations: map }, 'en'), { bio: null });
});

test('right after an edit the old translations are not shown', () => {
  assert.deepEqual(bioFor({ bio: `${ar} وضمان سنة`, bio_translations: map }, 'en'), { bio: `${ar} وضمان سنة` });
});

test('lists carry a shortened text; the cut text still matches its translations', () => {
  const long = 'أ'.repeat(BIO_LIST_MAX + 200);
  const row = { bio: long.slice(0, BIO_LIST_MAX + 1), bio_translations: { ar: long, en: 'b'.repeat(BIO_LIST_MAX + 200) } };
  const out = bioFor(row, 'en');
  assert.equal(out.bio.length, BIO_LIST_MAX + 1);
  assert.ok(out.bio.endsWith('…'));
  assert.ok(out.bio_translated.endsWith('…'));
});
