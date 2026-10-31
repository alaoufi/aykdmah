// Chat translation must never show a provider error as a translation (AYK-065).
const test = require('node:test');
const assert = require('node:assert/strict');
const { worthTranslating, translateViaMyMemory } = require('../services/translationService');

test('only text with real words is sent for translation', () => {
  for (const text of ['oo', 'ok', '123', '😀😀', 'aaaa']) assert.equal(worthTranslating(text), false, text);
  for (const text of ['مرحبا كيف الحال', 'Hello', 'Kumusta ka', 'ماترد']) assert.equal(worthTranslating(text), true, text);
});

test('MyMemory errors returned as text are rejected, real translations pass', async () => {
  const realFetch = global.fetch;
  const reply = body => async () => ({ ok: true, json: async () => body });
  try {
    global.fetch = reply({ responseStatus: 403, responseData: { translatedText: 'INVALID EMAIL PROVIDED' } });
    await assert.rejects(translateViaMyMemory('oo', 'en', 'ar'));
    global.fetch = reply({ responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } });
    await assert.rejects(translateViaMyMemory('hello', 'en', 'ar'));
    global.fetch = reply({ responseStatus: 200, responseData: { translatedText: 'مرحبا' } });
    assert.deepEqual(await translateViaMyMemory('hello', 'en', 'ar'), { text: 'مرحبا', provider: 'mymemory' });
  } finally { global.fetch = realFetch; }
});

test('MyMemory: a subtitle line for another sentence is never shown as the translation (AYK-118)', () => {
  const { pickMyMemory } = require('../services/translationService');
  const data = { responseData: { translatedText: '- في السياره اقتربنا من المطار', match: 0.99 }, matches: [
    { segment: 'Okay, where are you?', translation: '- في السياره اقتربنا من المطار', match: 0.99, 'created-by': 'Public_Corpora' },
    { segment: 'Okay. Where are you?', translation: 'حسناً أين أنت؟', match: 0.95, 'created-by': 'Public_Corpora' },
  ] };
  assert.equal(pickMyMemory('Okay, where are you?', data), 'حسناً أين أنت؟');
  assert.equal(pickMyMemory('Something else entirely', data), null);
});

test('Microsoft Translator: detects the language, skips a message already in the reader language (AYK-119)', async () => {
  const { translateViaMicrosoft, translate } = require('../services/translationService');
  const realFetch = global.fetch;
  const realKey = process.env.AZURE_TRANSLATOR_KEY;
  let sent;
  try {
    global.fetch = async (url, opts) => { sent = { url, opts }; return { ok: true, json: async () => [{ detectedLanguage: { language: 'en', score: 1 }, translations: [{ text: 'حسنًا، أين أنت؟', to: 'ar' }] }] }; };
    assert.deepEqual(await translateViaMicrosoft('Okay, where are you?', null, 'ar', 'k'), { text: 'حسنًا، أين أنت؟', provider: 'microsoft', from: 'en' });
    assert.ok(!sent.url.includes('from='), 'no source: Microsoft detects it');
    assert.equal(sent.opts.headers['Ocp-Apim-Subscription-Key'], 'k');
    assert.deepEqual(await translateViaMicrosoft('Okay, where are you?', null, 'en', 'k'), { text: 'Okay, where are you?', provider: 'noop' });
    global.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(translateViaMicrosoft('Hello there', null, 'ar', 'bad'));
    // A refused key falls back to the next provider instead of failing the chat.
    process.env.AZURE_TRANSLATOR_KEY = 'bad';
    let calls = 0;
    global.fetch = async url => { calls += 1; if (String(url).includes('microsofttranslator')) return { ok: false, status: 401 }; return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'مرحبا' } }) }; };
    const r = await translate('hello', 'en', 'ar');
    assert.equal(r.text, 'مرحبا');
    assert.equal(r.from, 'en', 'the note under the bubble names the source language (AYK-120)');
    assert.ok(calls >= 2);
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.AZURE_TRANSLATOR_KEY; else process.env.AZURE_TRANSLATOR_KEY = realKey;
  }
});
