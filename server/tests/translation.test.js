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
