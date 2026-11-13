import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGE_MODELS, LOCAL_MODEL_CACHE } from '../src/utils/localLanguage.js';
import { createLocalModelCache } from '../src/utils/localModelCache.js';

const model = LANGUAGE_MODELS.translation;
const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/config.json`;

function fixture(failAt = null) {
  const entries = new Map();
  const cache = {
    async match(key) {
      const stored = entries.get(typeof key === 'string' ? key : key.url);
      return stored ? new Response(stored.bytes, { headers: stored.headers }) : undefined;
    },
    async put(key, response) {
      if (failAt && key.includes(failAt)) throw new Error('Storage failed');
      entries.set(key, { bytes: await response.arrayBuffer(), headers: Object.fromEntries(response.headers) });
    },
    async keys() { return [...entries.keys()].map(key => new Request(key)); },
    async delete(key) { return entries.delete(typeof key === 'string' ? key : key.url); },
  };
  const storage = { async open(name) { assert.equal(name, LOCAL_MODEL_CACHE); return cache; } };
  return { entries, cache, modelCache: createLocalModelCache(storage, 256) };
}

test('chunked public model cache reconstructs exact bytes and freezes main aliases', async () => {
  const { entries, modelCache } = fixture();
  const bytes = new Uint8Array(908).map((_, index) => index % 256);
  await modelCache.put(url, new Response(bytes));
  assert.equal(entries.size, 5);
  const restored = await modelCache.match(url.replace(model.revision, 'main'));
  assert.equal(restored.headers.get('content-length'), '908');
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), bytes);
});

test('cache storage failure removes partial chunks and never advertises a model', async () => {
  const { entries, modelCache } = fixture('aykdmh_model_chunk=1');
  await modelCache.put(url, new Response(new Uint8Array(908)));
  assert.equal(entries.size, 0);
  assert.equal(await modelCache.match(url), undefined);
});

test('missing or incorrectly sized chunks reject incomplete cached weights', async () => {
  const { entries, modelCache } = fixture();
  await modelCache.put(url, new Response(new Uint8Array(908)));
  entries.delete(url + '?aykdmh_model_chunk=1');
  assert.equal(await modelCache.match(url), undefined);
  await modelCache.put(url, new Response(new Uint8Array(907)));
  assert.equal(await modelCache.match(url), undefined);
  assert.equal(entries.size, 0);
});

test('chat data, queries and partial HTTP responses never enter model cache', async () => {
  const { entries, modelCache } = fixture();
  for (const key of ['/api/media/private', url + '?chat=secret', 'https://attacker.example/model']) {
    await modelCache.put(key, new Response('private'));
    assert.equal(await modelCache.match(key), undefined);
  }
  await modelCache.put(url, new Response('x', { status: 206 }));
  assert.equal(entries.size, 0);
});
