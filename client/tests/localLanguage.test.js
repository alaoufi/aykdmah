import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_MODELS, LOCAL_AUDIO_MAX_SECONDS, LOCAL_SAMPLE_RATE,
  assertLocalLanguageJob, authorizedMediaPath, guessLocalSourceLanguage,
  localLanguageSupported, localVoiceForLanguage, modelFileDescriptor, pinnedModelDownloadUrl,
  numericTokens, splitLocalTranslationText, translationChangesNumbers,
} from '../src/utils/localLanguage.js';
import { LocalLanguageSession } from '../src/utils/localLanguageSession.js';

test('source hints recognize the five scripts but let ambiguous text be overridden', () => {
  for (const [text, language] of [['السعر', 'ar'], ['price', 'en'], ['قیمت بھیجیں', 'ur'], ['कीमत', 'hi'], ['দাম', 'bn']]) {
    assert.equal(guessLocalSourceLanguage(text), language);
  }
  assert.equal(guessLocalSourceLanguage('123 😃'), null);
});

test('only pinned public model files form permitted download URLs', () => {
  const model = LANGUAGE_MODELS.translation;
  const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/tokenizer.json`;
  assert.deepEqual(modelFileDescriptor(url), { kind: 'translation', file: 'tokenizer.json', size: 7988527 });
  for (const denied of [url + '?text=private', url.replace(model.revision, 'main'), url.replace('tokenizer.json', 'chat'),
    url.replace('https:', 'http:'), url.replace('huggingface.co', 'huggingface.co.attacker.test'),
    url.replace('huggingface.co', 'user:secret@huggingface.co'), url + '#private']) assert.equal(modelFileDescriptor(denied), null);
});

test('numeric comparison normalizes native digits and flags added, removed and changed numbers', () => {
  assert.deepEqual(numericTokens('١٢٠.٥ ۲۵ ३४ ৫৬'), ['120.5', '25', '34', '56']);
  assert.equal(translationChangesNumbers('السعر ١٢٠ والوقت ١٨:٣٠', 'Price 120; time 18:30'), false);
  assert.equal(translationChangesNumbers('Price 120', 'السعر ١٠٢'), true);
  assert.equal(translationChangesNumbers('Price 120', 'السعر'), true);
  assert.equal(translationChangesNumbers('Tomorrow morning', 'Tomorrow 8:00'), true);
});

test('library main metadata aliases are frozen before network or cache access', () => {
  const model = LANGUAGE_MODELS.translation;
  const url = `https://huggingface.co/${model.id}/resolve/main/tokenizer_config.json`;
  assert.equal(pinnedModelDownloadUrl(url), url.replace('/main/', `/${model.revision}/`));
  assert.equal(pinnedModelDownloadUrl(url.replace('tokenizer_config.json', 'private-message')), null);
  assert.equal(pinnedModelDownloadUrl(url + '?chat=secret'), null);
  assert.equal(pinnedModelDownloadUrl(url.replace('/main/', '/different-revision/')), null);
});

test('translation input chunks preserve the entire message and never silently truncate a long word', () => {
  const text = 'Please send me the price. ' + 'The service takes one hour. '.repeat(40);
  const chunks = splitLocalTranslationText(text);
  assert.ok(chunks.every(chunk => chunk.length <= 350));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.trim());
  assert.throws(() => splitLocalTranslationText('x'.repeat(400)), error => error.code === 'too_long');
});

test('private attachment path rejects external origins, credentials, ambiguous paths and queries', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const origin = 'https://awtad.example';
  const path = `/api/media/${uuid}`;
  assert.equal(authorizedMediaPath(path, origin), `/media/${uuid}`);
  assert.equal(authorizedMediaPath(origin + path, origin), `/media/${uuid}`);
  assert.equal(authorizedMediaPath('https://api.awtad.example' + path, origin, 'https://api.awtad.example'), `/media/${uuid}`);
  for (const url of ['https://attacker.example' + path, '//attacker.example' + path,
    'https://user:pass@awtad.example' + path, path + '?token=secret', '/uploads/a.wav', path + '#x', path.replace('media', 'media%2f..'), '\\' + path]) {
    assert.equal(authorizedMediaPath(url, origin), null);
  }
});

test('playback chooses only a matching installed local voice', () => {
  const local = { lang: 'hi-IN', localService: true };
  assert.equal(localVoiceForLanguage([{ lang: 'hi-IN', localService: false }, { lang: 'en-US', localService: true }, local], 'hi'), local);
  assert.equal(localVoiceForLanguage([{ lang: 'ur-PK', localService: false }], 'ur'), null);
});

test('local runtime support requires a worker, BigInt and valid SIMD', () => {
  assert.equal(localLanguageSupported({ Worker: Function, BigInt, WebAssembly }), true);
  assert.equal(localLanguageSupported({ BigInt, WebAssembly }), false);
  assert.equal(localLanguageSupported({ Worker: Function, BigInt, WebAssembly: { validate: () => false } }), false);
});

test('worker jobs bound full text, decoded audio and supported languages', () => {
  const text = { kind: 'text', text: 'price', sourceLanguage: 'en', targetLanguage: 'ar' };
  assert.doesNotThrow(() => assertLocalLanguageJob(text));
  assert.throws(() => assertLocalLanguageJob({ ...text, text: 'a'.repeat(1501) }), error => error.code === 'too_long');
  assert.throws(() => assertLocalLanguageJob({ ...text, targetLanguage: 'de' }), error => error.code === 'failed');
  const audio = { kind: 'audio', audio: new Float32Array(LOCAL_SAMPLE_RATE), sourceLanguage: 'auto', targetLanguage: 'ur' };
  assert.doesNotThrow(() => assertLocalLanguageJob(audio));
  assert.throws(() => assertLocalLanguageJob({ ...audio, audio: new Float32Array(LOCAL_SAMPLE_RATE * LOCAL_AUDIO_MAX_SECONDS + 1) }), error => error.code === 'too_long');
  assert.throws(() => assertLocalLanguageJob({ ...audio, audio: new Float32Array([NaN]) }), error => error.code === 'too_long');
});

function fixture() {
  const workers = [];
  let current = true;
  const session = new LocalLanguageSession({
    isCurrent: () => current,
    workerFactory: () => {
      const worker = { posts: [], stopped: false, postMessage(data) { this.posts.push(data); }, terminate() { this.stopped = true; } };
      workers.push(worker); return worker;
    },
  });
  return { session, workers, invalidate: () => { current = false; } };
}
const job = { kind: 'text', text: 'private message', sourceLanguage: 'en', targetLanguage: 'ar' };

test('session creates no worker or model download until explicit consent and action', async () => {
  const { session, workers } = fixture();
  assert.equal(workers.length, 0);
  assert.throws(() => session.run(job), error => error.code === 'failed');
  assert.equal(workers.length, 0);
  session.allow('text');
  const promise = session.run(job, { owner: 'message1' });
  assert.equal(workers.length, 1);
  workers[0].onmessage({ data: { type: 'result', id: 1, result: { translation: 'رسالة خاصة', transcript: null } } });
  assert.equal((await promise).translation, 'رسالة خاصة');
  assert.equal(session.job, null);
  session.destroy();
});

test('only one shared model job can run and another message cannot cancel its owner', async () => {
  const { session, workers } = fixture(); session.allow('text');
  const promise = session.run(job, { owner: 'one' });
  assert.throws(() => session.run(job, { owner: 'two' }), error => error.code === 'busy');
  session.cancel('two'); assert.equal(workers[0].stopped, false);
  session.cancel('one');
  await assert.rejects(promise, error => error.name === 'AbortError');
  assert.equal(workers[0].stopped, true); assert.equal(session.job, null);
  session.destroy();
});

test('late results from an old account are discarded and its worker is destroyed', async () => {
  const { session, workers, invalidate } = fixture(); session.allow('text');
  const promise = session.run(job); invalidate();
  workers[0].onmessage({ data: { type: 'result', id: 1, result: { translation: 'stale private result' } } });
  await assert.rejects(promise, error => error.name === 'AbortError');
  assert.equal(workers[0].stopped, true); assert.equal(session.allowed('text'), false);
});

test('worker failures expose only allowlisted UI codes and preserve no job payload', async () => {
  const { session, workers } = fixture(); session.allow('text');
  const promise = session.run(job);
  workers[0].onmessage({ data: { type: 'error', id: 1, code: 'private backend diagnostics' } });
  await assert.rejects(promise, error => error.code === 'failed');
  assert.equal(session.job, null); assert.equal(session.worker, null);
  session.destroy();
});

test('foreign job results cannot resolve the active request', async () => {
  const { session, workers } = fixture(); session.allow('text');
  const promise = session.run(job);
  workers[0].onmessage({ data: { type: 'result', id: 100, result: { translation: 'wrong result' } } });
  assert.ok(session.job);
  session.destroy(); await assert.rejects(promise, error => error.name === 'AbortError');
});
