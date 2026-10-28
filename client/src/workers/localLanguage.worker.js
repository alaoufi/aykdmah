import {
  env, AutoTokenizer, AutoProcessor, AutoModelForSeq2SeqLM,
  AutoModelForSpeechSeq2Seq, TranslationPipeline, AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import {
  LANGUAGE_MODELS, LOCAL_TEXT_MAX_CHARACTERS,
  assertLocalLanguageJob, guessLocalSourceLanguage, localLanguageError,
  pinnedModelDownloadUrl, splitLocalTranslationText, translationChangesNumbers,
} from '../utils/localLanguage.js';
import { createLocalModelCache } from '../utils/localModelCache.js';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = 'https://huggingface.co/';
env.useBrowserCache = false;
env.useFSCache = false;
// Transformers v4 otherwise creates a blob module while caching its factory.
// Use the regular fingerprinted module directly under the site's script CSP.
env.useWasmCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
// Both runtime artifacts are fingerprinted, same-origin Vite assets. No CDN
// executable code, blob worker, GPU driver or cross-origin isolation is needed.
env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };

const runtimeUrls = new Set([new URL(wasmUrl, self.location.href).href, new URL(mjsUrl, self.location.href).href]);
const browserFetch = self.fetch.bind(self);
self.fetch = (input, options = {}) => {
  const url = input instanceof Request ? input.url : new URL(String(input), self.location.href).href;
  const pinnedUrl = pinnedModelDownloadUrl(url);
  const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  // A strict GET-only boundary makes an accidental remote inference request
  // impossible even if a future library release adds a network feature.
  if (method !== 'GET' || options.body != null
      || (!runtimeUrls.has(url) && !pinnedUrl)) return Promise.reject(localLanguageError('failed'));
  const range = new Headers(options.headers).get('Range');
  return browserFetch(pinnedUrl || url, {
    method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
    mode: 'cors', signal: options.signal,
    ...(range === 'bytes=0-0' ? { headers: { Range: range } } : {}),
  });
};
// v4 captures fetch in env at import time; keep both entry points constrained.
env.fetch = self.fetch;

if (self.caches) {
  env.useCustomCache = true;
  env.customCache = createLocalModelCache(self.caches);
}

let translator = null;
let speech = null;
let running = false;
const languageNames = { ar: 'arabic', en: 'english', ur: 'urdu', hi: 'hindi', bn: 'bengali', ml: 'malayalam', fil: 'tagalog', id: 'indonesian', ne: 'nepali', am: 'amharic', tr: 'turkish' };
// The translation model names Filipino by its ISO 639-1 code.
const modelCode = code => (code === 'fil' ? 'tl' : code);

function report(id, stage, percent = null) { self.postMessage({ type: 'progress', id, stage, percent }); }

function downloadProgress(id, kind) {
  const files = LANGUAGE_MODELS[kind].files;
  const total = Object.values(files).reduce((sum, size) => sum + size, 0);
  const loaded = new Map();
  let lastPercent = -1;
  return progress => {
    if (!Object.hasOwn(files, progress.file)) return;
    if (progress.status === 'done') loaded.set(progress.file, files[progress.file]);
    else if (progress.status === 'progress' && Number.isFinite(progress.loaded)) {
      loaded.set(progress.file, Math.min(files[progress.file], progress.loaded));
    }
    const percent = Math.floor(100 * [...loaded.values()].reduce((sum, value) => sum + value, 0) / total);
    if (percent !== lastPercent) { report(id, 'downloading', percent); lastPercent = percent; }
    if (percent === 100) report(id, 'loading');
  };
}

async function translationModel(id) {
  if (translator) return translator;
  report(id, 'loading');
  const model = LANGUAGE_MODELS.translation;
  const options = {
    revision: model.revision, dtype: 'q8', device: 'wasm', use_external_data_format: false,
    progress_callback: downloadProgress(id, 'translation'),
  };
  // v4 pipeline() file discovery checks the mutable `main` revision even when
  // revision is supplied. Load public Auto classes directly so every request
  // stays pinned and within the static model-file allowlist.
  const [tokenizer, loaded] = await Promise.all([
    AutoTokenizer.from_pretrained(model.id, options),
    AutoModelForSeq2SeqLM.from_pretrained(model.id, options),
  ]);
  translator = new TranslationPipeline({ task: 'translation', tokenizer, model: loaded });
  return translator;
}

async function speechModel(id) {
  if (speech) return speech;
  // Keep peak mobile memory lower by avoiding two inference models at once.
  if (translator) { await translator.dispose(); translator = null; }
  report(id, 'loading');
  const model = LANGUAGE_MODELS.speech;
  const options = {
    revision: model.revision, dtype: 'q8', device: 'wasm', use_external_data_format: false,
    progress_callback: downloadProgress(id, 'speech'),
  };
  const [tokenizer, processor, loaded] = await Promise.all([
    AutoTokenizer.from_pretrained(model.id, options),
    AutoProcessor.from_pretrained(model.id, options),
    AutoModelForSpeechSeq2Seq.from_pretrained(model.id, options),
  ]);
  speech = new AutomaticSpeechRecognitionPipeline({ task: 'automatic-speech-recognition', tokenizer, processor, model: loaded });
  return speech;
}

async function translateText(id, text, sourceLanguage, targetLanguage) {
  if (!text.trim() || text.length > LOCAL_TEXT_MAX_CHARACTERS) throw localLanguageError('too_long');
  const model = await translationModel(id);
  const pieces = splitLocalTranslationText(text);
  const translated = [];
  report(id, 'translating');
  for (const piece of pieces) {
    // The standard TranslationPipeline silently enables input truncation.
    // Use its tokenizer/model with explicit bounds and reject incomplete
    // generation instead of presenting only part of a long message.
    const options = { src_lang: modelCode(sourceLanguage), tgt_lang: modelCode(targetLanguage), max_new_tokens: 256, num_beams: 1 };
    const inputs = model.tokenizer._build_translation_inputs(piece, { padding: true, truncation: false }, options);
    if (inputs.input_ids.dims.at(-1) > 480) throw localLanguageError('too_long');
    const tokens = await model.model.generate({ ...inputs, ...options });
    const ids = Array.from(tokens.data, Number);
    const eos = model.model.generation_config.eos_token_id ?? model.model.config.eos_token_id;
    if (ids.length >= options.max_new_tokens + 1 || ids.at(-1) !== eos) throw localLanguageError('too_long');
    const result = model.tokenizer.batch_decode(tokens, { skip_special_tokens: true })[0]?.trim();
    if (!result) throw localLanguageError('failed');
    translated.push(result);
  }
  const translation = translated.join('\n');
  return { translation, numbersChanged: translationChangesNumbers(text, translation) };
}

self.onmessage = async event => {
  const job = event.data;
  if (job?.type !== 'run' || !Number.isSafeInteger(job.id) || running) return;
  running = true;
  try {
    assertLocalLanguageJob(job);
    let text = job.text;
    let transcript = null;
    if (job.kind === 'audio') {
      const model = await speechModel(job.id);
      report(job.id, 'transcribing');
      const result = await model(job.audio, {
        ...(job.sourceLanguage === 'auto' ? {} : { language: languageNames[job.sourceLanguage] }),
        task: 'transcribe', chunk_length_s: 30, stride_length_s: 5,
        max_new_tokens: 256, no_speech_threshold: 0.6,
      });
      transcript = result?.text?.trim();
      await speech.dispose(); speech = null;
      if (!transcript) throw localLanguageError('audio_unsupported');
      text = transcript;
    }
    const sourceLanguage = job.sourceLanguage === 'auto' ? guessLocalSourceLanguage(text) : job.sourceLanguage;
    if (!sourceLanguage) throw localLanguageError('failed');
    if (sourceLanguage === job.targetLanguage) {
      if (!transcript) throw localLanguageError('same_language');
      self.postMessage({ type: 'result', id: job.id, result: { transcript, translation: null, sourceLanguage, targetLanguage: job.targetLanguage, numbersChanged: false } });
    } else {
      const result = await translateText(job.id, text, sourceLanguage, job.targetLanguage);
      self.postMessage({ type: 'result', id: job.id, result: { ...result, transcript, sourceLanguage, targetLanguage: job.targetLanguage } });
    }
  } catch (error) {
    const codes = ['failed', 'unsupported', 'too_long', 'same_language', 'audio_unsupported'];
    self.postMessage({ type: 'error', id: job.id, code: codes.includes(error?.code) ? error.code : 'failed' });
  } finally { running = false; }
};
