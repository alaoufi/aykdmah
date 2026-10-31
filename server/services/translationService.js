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
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u1200-\u137F]/.test(text)) return 'am';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}

// MyMemory answers errors with HTTP 200 and the error as the "translation" (e.g. "INVALID EMAIL
// PROVIDED", "MYMEMORY WARNING: …"); those must never reach a chat (AYK-065).
const PROVIDER_ERROR = /^(INVALID |MYMEMORY WARNING|QUERY LENGTH LIMIT|PLEASE SELECT|NO QUERY SPECIFIED|'?AUTO'? IS AN INVALID)/i;
// MyMemory often answers from a memory of film subtitles, whose first match can be another line
// altogether (AYK-118). Keep only a match for this very sentence: same letters, no dialogue dash,
// a close score and a sane length; machine translation first when it is offered.
const lettersOf = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function pickMyMemory(text, data) {
  const wanted = lettersOf(text);
  const reliable = m => m && typeof m.translation === 'string' && m.translation.trim()
    && !/^\s*[-–—]/.test(m.translation) && (m.match == null || Number(m.match) >= 0.85)
    && lettersOf(m.segment) === wanted && m.translation.length <= Math.max(12, text.length * 2.5);
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  const machine = matches.find(m => String(m['created-by'] || '').startsWith('MT') && reliable(m));
  if (machine) return machine.translation;
  const human = matches.filter(reliable).sort((a, b) => Number(b.match) - Number(a.match))[0];
  if (human) return human.translation;
  // No list of matches (a plain answer): trust it only when it passes the same checks.
  const top = data?.responseData;
  return top && !matches.length && reliable({ ...top, translation: top.translatedText, segment: text }) ? top.translatedText : null;
}

async function translateViaMyMemory(text, source, target) {
  // A valid contact address raises the free daily quota; the old one had no domain and was refused.
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${source}|${target}&de=support@aykdmh.com&mt=1`;
  const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!r.ok) throw new Error(`mymemory:${r.status}`);
  const data = await r.json();
  if (Number(data?.responseStatus) !== 200) throw new Error(`mymemory:status:${data?.responseStatus}`);
  const translated = pickMyMemory(text, data);
  if (!translated) throw new Error('mymemory:unreliable');
  if (PROVIDER_ERROR.test(translated.trim())) throw new Error('mymemory:error-text');
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

// At least one word of 3+ letters that is not a single letter repeated.
function worthTranslating(text) {
  const words = String(text).match(/\p{L}{3,}/gu) || [];
  return words.some(word => !/^(\p{L})\1+$/u.test(word.replace(/(\p{L})\1{2,}/gu, '$1$1')) && new Set(word).size > 1);
}

// Public entry point. Returns { text, provider } or throws.
async function translate(text, sourceLang, targetLang) {
  const src = (sourceLang && SUPPORTED.includes(sourceLang)) ? sourceLang : await detectLanguageFallback(text);
  const tgt = SUPPORTED.includes(targetLang) ? targetLang : 'en';
  // Nothing to translate: the same language, or no real words ("oo", "تلللد", numbers, emoji).
  if (src === tgt || !text || !worthTranslating(text)) {
    return { text, provider: 'noop' };
  }
  const apiKey = await Setting.get('google_translate_api_key').catch(() => null);
  if (apiKey && apiKey.length > 10) {
    try { return await translateViaGoogle(text, src, tgt, apiKey); } catch (_) { /* fall through */ }
  }
  return await translateViaMyMemory(text, src, tgt);
}

module.exports = { translate, detectLanguageFallback, worthTranslating, translateViaMyMemory, SUPPORTED, pickMyMemory };
