// Translates a single short label (category name, service name, …) into
// every active platform language. Wraps the generic translationService
// with caching and concurrency control suitable for admin-side CRUD.
//
// Strategy:
//   • Caller passes the canonical text + its source language.
//   • We translate to every other supported language in parallel.
//   • Failures fall back to the source (never leave a blank).
//   • Result is the shape stored in name_translations JSON.

const translationService = require('./translationService');

// Source-of-truth language list. Keep in sync with client/i18n/index.js.
// (Adding 'fr' here later auto-translates every new/updated category
//  into French — zero schema or controller changes needed.)
const TARGET_LANGS = ['ar', 'en', 'ur', 'bn', 'hi'];

async function translateAllLanguages(text, sourceLang = 'ar') {
  const src = (sourceLang || 'ar').toLowerCase().slice(0, 2);
  const map = { [src]: text };
  if (!text || !String(text).trim()) {
    for (const l of TARGET_LANGS) map[l] = text || '';
    return map;
  }
  const targets = TARGET_LANGS.filter((l) => l !== src);
  const results = await Promise.allSettled(
    targets.map((l) => translationService.translate(text, src, l))
  );
  for (let i = 0; i < targets.length; i++) {
    const r = results[i];
    map[targets[i]] = r.status === 'fulfilled' && r.value?.text ? r.value.text : text;
  }
  return map;
}

// Merge an existing translations object with newly provided overrides.
// Useful for partial updates: admin tweaks the Arabic name → we
// re-translate; admin tweaks only the icon → translations stay intact.
function mergeTranslations(existing, fresh) {
  return { ...(existing || {}), ...(fresh || {}) };
}

module.exports = { translateAllLanguages, mergeTranslations, TARGET_LANGS };
