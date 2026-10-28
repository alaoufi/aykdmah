// Lightweight translation service.
// Strategy:
//   1. Try Google Translate v2 if google_translate_api_key is set.
//   2. Otherwise fall back to MyMemory (https://mymemory.translated.net),
//      which is free for ~5k chars/day with no key.
// Results are cached per (review_id, language) in review_translations so
// each public translation is only fetched once.

const Setting = require('../models/Setting');

const SUPPORTED = ['ar', 'en', 'ur', 'bn', 'hi', 'ml', 'fil', 'id', 'ne', 'am', 'tr'];

async function detectLanguageFallback(text) {
  // Very cheap heuristic — covers our 5 active scripts. A real detector
  // (e.g. franc) would be overkill for short reviews.
  if (!text) return 'en';
  if (/[؀-ۿ]/.test(text)) {
    // Arabic block — distinguish Urdu (presence of چ پ گ etc.)
    if (/[ٹپچڈڑژکگںھہۃیے]/.test(text)) return 'ur';
    return 'ar';
  }
  if (/[ঀ-৿]/.test(text)) return 'bn';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}

async function translateViaMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${source}|${target}&de=info@local-marketplace`;
  const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!r.ok) throw new Error(`mymemory:${r.status}`);
  const data = await r.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('mymemory:empty');
  return { text: translated, provider: 'mymemory' };
}

async function translateViaGoogle(text, source, target, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
  });
  if (!r.ok) throw new Error(`google:${r.status}`);
  const data = await r.json();
  const translated = data?.data?.translations?.[0]?.translatedText;
  if (!translated) throw new Error('google:empty');
  return { text: translated, provider: 'google' };
}

// Public entry point. Returns { text, provider } or throws.
async function translate(text, sourceLang, targetLang) {
  const src = (sourceLang && SUPPORTED.includes(sourceLang)) ? sourceLang : await detectLanguageFallback(text);
  const tgt = SUPPORTED.includes(targetLang) ? targetLang : 'en';
  if (src === tgt || !text || text.trim().length === 0) {
    return { text, provider: 'noop' };
  }
  const apiKey = await Setting.get('google_translate_api_key').catch(() => null);
  if (apiKey && apiKey.length > 10) {
    try { return await translateViaGoogle(text, src, tgt, apiKey); } catch (_) { /* fall through */ }
  }
  return await translateViaMyMemory(text, src, tgt);
}

module.exports = { translate, detectLanguageFallback, SUPPORTED };
