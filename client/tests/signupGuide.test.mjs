import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// AYK-296: the sign-up guide is complete in every language, quotes the page's own labels through
// the same placeholders as Arabic, and has a picture of every step in every language.
const LANGS = ['ar', 'en', 'ur', 'hi', 'bn', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];
const STEPS = ['types', 'account', 'location', 'work', 'schedule', 'finish'];
const load = lang => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
const vars = text => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

test('every language has the whole sign-up guide with the same placeholders and pictures', () => {
  const ar = load('ar').signup_guide;
  for (const lang of LANGS) {
    const guide = load(lang).signup_guide;
    for (const key of ['title', 'intro', 'choose_language', 'choose_language_hint', 'start', 'reopen', 'image_note']) {
      assert.ok(String(guide?.[key] || '').trim(), `${lang} ${key}`);
    }
    for (const step of STEPS) {
      const item = guide.steps[step];
      assert.ok(item.title.trim() && item.body.trim(), `${lang} ${step}`);
      assert.ok(!/^\s*[\d٠-٩০-৯०-९]+\./.test(item.title), `${lang} ${step}: the book numbers the steps itself`);
      assert.deepEqual(vars(item.body), vars(ar.steps[step].body), `${lang} ${step} placeholders`);
      if (lang !== 'ar' && lang !== 'ur') assert.ok(!/[؀-ۿ]/.test(item.body), `${lang} ${step}: Arabic left in the text`);
      assert.ok(existsSync(new URL(`../public/guide/signup/${lang}/${step}.webp`, import.meta.url)), `${lang} ${step} picture`);
    }
  }
});
