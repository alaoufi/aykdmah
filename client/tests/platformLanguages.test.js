import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { localizedTerms } from '../src/utils/localizeTerms.js';

const languages = ['ar', 'en', 'ur', 'hi', 'bn'];
const locales = Object.fromEntries(languages.map(code => [code, JSON.parse(readFileSync(new URL(`../src/i18n/locales/${code}.json`, import.meta.url), 'utf8'))]));
const sourceMigration = readFileSync(new URL('../../database/migrations/025_terms_acceptance.sql', import.meta.url), 'utf8');
const defaultTerms = sourceMigration.split("('terms_text',\n'")[1].split("',\n'text'")[0];

const output = await build({
  stdin: {
    resolveDir: new URL('../src/', import.meta.url).pathname,
    contents: `
      export { default as i18n, applyLanguageToDocument } from './i18n/index.js';
      export * from './utils/formatters.js';
      export { formatDistance as trackingDistance } from './utils/geo.js';
    `,
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const client = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('the original platform terms have complete native copies while custom legal text stays intact', () => {
  for (const lang of languages) {
    const translate = key => key.split('.').reduce((o, part) => o[part], locales[lang]);
    const html = localizedTerms({ terms_text: defaultTerms }, lang, translate);
    assert.equal(html, locales[lang].policy.default_terms_html);
    assert.equal((html.match(/<p><b>/g) || []).length, 8, `${lang} retains all eight legal sections`);
    assert.equal((html.match(/<li>/g) || []).length, 4, `${lang} retains the conversation review limits`);
    assert.doesNotMatch(html, /RIZA|RYZA|ريزا/);
    if (lang === 'ar') assert.match(html, /خدمات أوتاد/);
    else assert.match(html, /AWTAD SERVICES/);
    assert.equal(localizedTerms({ terms_text: '<p>Administrator-customized legal text.</p>' }, lang, translate), '<p>Administrator-customized legal text.</p>');
    assert.equal(localizedTerms({ terms_text: `${defaultTerms}<p>New clause</p>` }, lang, translate), `${defaultTerms}<p>New clause</p>`);
    assert.equal(localizedTerms({ terms_text: defaultTerms, [`terms_text_${lang}`]: '<p>Approved translated terms.</p>' }, lang, translate), '<p>Approved translated terms.</p>');
  }
});

test('native locale files contain no accidental English-only labels beyond intentional brand and technical values', () => {
  const allowed = new Set(['common.brand', 'language.english', 'verify.method_sms', 'admin.ad_media_hint']);
  for (const lang of ['ar', 'ur', 'hi', 'bn']) {
    const walk = (object, prefix = '') => {
      for (const [key, value] of Object.entries(object)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') { walk(value, fullKey); continue; }
        const display = String(value).replace(/\{\{.*?\}\}/g, '').replace(/<[^>]*>/g, '');
        if (/[A-Za-z]{3}/.test(display) && !/[\u0600-\u06ff\u0900-\u097f\u0980-\u09ff]/.test(display)) assert.ok(allowed.has(fullKey), `${lang}.${fullKey} unexpectedly remains English: ${display}`);
      }
    };
    walk(locales[lang]);
  }
});

test('formatters follow the current language for dates, times, currency and distances', async () => {
  for (const lang of languages) {
    await client.i18n.changeLanguage(lang);
    const date = new Date('2026-10-01T12:30:00Z');
    assert.equal(client.formatDate(date), date.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' }));
    assert.equal(client.formatTime(date), date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }));
    assert.equal(client.formatRelativeTime(new Date(Date.now() - 7200001)), new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-2, 'hour'));
    const currencyLabel = lang === 'ar' ? 'ر.س' : locales[lang].common.currency;
    assert.equal(client.formatCurrency(1240.5), `${(1240.5).toLocaleString(lang, { maximumFractionDigits: 2 })} ${currencyLabel}`);
    const distance = `${(2.5).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${locales[lang].common.kilometer_short}`;
    assert.equal(client.formatDistance('2.5'), distance);
    assert.equal(client.trackingDistance('2.5'), distance);
    assert.equal(client.formatDistance(0.125), `${(125).toLocaleString(lang)} ${locales[lang].common.meter_short}`);
  }
  assert.equal(client.formatDate('bad date'), '');
  assert.equal(client.formatRelativeTime('bad date'), '');
  assert.equal(client.formatDistance('bad distance'), '');
  assert.equal(client.trackingDistance('bad distance'), '—');
});

test('switching languages changes browser and share metadata and document direction', async () => {
  const elements = new Map();
  const previousDocument = globalThis.document;
  globalThis.document = {
    documentElement: {},
    head: {
      querySelector(selector) {
        const [, attribute, value] = selector.match(/^meta\[([^=]+)="([^"]+)"\]$/);
        return elements.get(`${attribute}:${value}`) || null;
      },
      appendChild(node) { elements.set(`${node.attributes.name ? 'name' : 'property'}:${node.attributes.name || node.attributes.property}`, node); },
    },
    createElement() { return { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }; },
  };
  try {
    for (const lang of languages) {
      await client.i18n.changeLanguage(lang);
      const title = `${locales[lang].common.brand} — ${locales[lang].common.tagline}`;
      assert.equal(document.title, title);
      assert.equal(document.documentElement.lang, lang);
      assert.equal(document.documentElement.dir, ['ar', 'ur'].includes(lang) ? 'rtl' : 'ltr');
      assert.equal(elements.get('name:description').attributes.content, locales[lang].meta.description);
      assert.equal(elements.get('property:og:title').attributes.content, title);
      assert.equal(elements.get('name:twitter:description').attributes.content, locales[lang].meta.description);
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
