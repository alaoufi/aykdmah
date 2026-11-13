// Only these public, pinned model files may be downloaded by the language worker.
// Conversation text, decoded audio and inference results never form a URL.
export const LOCAL_LANGUAGES = ['ar', 'ur', 'hi', 'bn', 'ml', 'fil', 'id', 'ne', 'am', 'tr', 'en'];
export const LOCAL_TEXT_MAX_CHARACTERS = 1500;
export const LOCAL_AUDIO_MAX_SECONDS = 60;
export const LOCAL_AUDIO_MAX_BYTES = 3.5 * 1024 * 1024;
export const LOCAL_SAMPLE_RATE = 16000;
export const LOCAL_MODEL_CACHE = 'aykdmh-local-language-models-v1';
export const LANGUAGE_MODELS = {
  translation: {
    id: 'Xenova/m2m100_418M',
    revision: '9c374f0b7aca709787cea97b047bfbbd1559d177',
    files: {
      'config.json': 908,
      'generation_config.json': 233,
      'tokenizer.json': 7988527,
      'tokenizer_config.json': 1813,
      'onnx/encoder_model_quantized.onnx': 287856370,
      'onnx/decoder_model_merged_quantized.onnx': 344128178,
    },
  },
  speech: {
    id: 'Xenova/whisper-tiny',
    revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
    files: {
      'config.json': 2248,
      'generation_config.json': 3716,
      'tokenizer.json': 2480466,
      'tokenizer_config.json': 282683,
      'preprocessor_config.json': 339,
      'onnx/encoder_model_quantized.onnx': 10124910,
      'onnx/decoder_model_merged_quantized.onnx': 30727765,
    },
  },
};

export function normalizeLocalLanguage(value, fallback = 'ar') {
  const language = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '';
  return LOCAL_LANGUAGES.includes(language) ? language : fallback;
}

// A script hint, rather than a claimed language detector. Arabic and Urdu can
// share every character in a short message; the source selector stays editable.
export function guessLocalSourceLanguage(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (/[\u0980-\u09FF]/u.test(text)) return 'bn';
  if (/[\u0D00-\u0D7F]/u.test(text)) return 'ml';
  if (/[\u1200-\u137F]/u.test(text)) return 'am';
  if (/[\u0900-\u097F]/u.test(text)) return 'hi';
  if (/[پچژگٹڈڑںھے]/u.test(text)) return 'ur';
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(text)) return 'ar';
  if (/[A-Za-z]/u.test(text)) return 'en';
  return null;
}

export function numericTokens(text) {
  const zeroes = [0x0660, 0x06F0, 0x0966, 0x09E6];
  const normalized = String(text || '').replace(/[٠-٩۰-۹०-९০-৯]/gu, character => {
    const point = character.codePointAt(0);
    return String(point - zeroes.find(zero => point >= zero && point <= zero + 9));
  }).replace(/٫/gu, '.').replace(/٬/gu, ',');
  return normalized.match(/\d+(?:[.,:]\d+)*/gu) || [];
}

export function translationChangesNumbers(original, translated) {
  return JSON.stringify(numericTokens(original)) !== JSON.stringify(numericTokens(translated));
}

export function modelFileDescriptor(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co'
      || url.username || url.password || url.search || url.hash) return null;
  for (const [kind, model] of Object.entries(LANGUAGE_MODELS)) {
    const prefix = `/${model.id}/resolve/${model.revision}/`;
    if (!url.pathname.startsWith(prefix)) continue;
    const file = url.pathname.slice(prefix.length);
    if (Object.hasOwn(model.files, file)) return { kind, file, size: model.files[file] };
  }
  return null;
}

// Transformers v4's tokenizer/processor discovery internally asks for `main`
// metadata without passing through the supplied revision. Freeze that alias to
// our two known model snapshots before either network access or cache access.
export function pinnedModelDownloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || url.username
      || url.password || url.search || url.hash) return null;
  for (const model of Object.values(LANGUAGE_MODELS)) {
    const prefix = `/${model.id}/resolve/main/`;
    if (url.pathname.startsWith(prefix)) {
      const file = url.pathname.slice(prefix.length);
      if (!Object.hasOwn(model.files, file)) return null;
      url.pathname = `/${model.id}/resolve/${model.revision}/${file}`;
      return url.href;
    }
  }
  return modelFileDescriptor(url.href) ? url.href : null;
}

export function localLanguageSupported(environment = globalThis) {
  if (typeof environment.Worker !== 'function' || !environment.WebAssembly
      || typeof environment.BigInt !== 'function') return false;
  // ONNX's SIMD build is required; a single thread avoids SharedArrayBuffer,
  // cross-origin isolation and nested worker/blob requirements on mobile.
  const simd = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,9,1,7,0,65,0,253,15,26,11]);
  try { return environment.WebAssembly.validate(simd); } catch { return false; }
}

export function authorizedMediaPath(value, pageOrigin, apiOrigin = pageOrigin) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/u.test(value)) return null;
  let url;
  try { url = new URL(value, pageOrigin); } catch { return null; }
  if (![pageOrigin, apiOrigin].includes(url.origin) || url.username || url.password
      || url.search || url.hash || !/^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url.pathname)) return null;
  // This is always sent through the configured, authenticated API client,
  // regardless of whether the message happened to contain an absolute URL.
  return url.pathname.slice(4);
}

export function localLanguageError(code) {
  return Object.assign(new Error(code), { code });
}

export function abortLocalLanguage() {
  return Object.assign(new Error('Cancelled'), { name: 'AbortError', code: 'cancelled' });
}

export function assertLocalLanguageJob(job) {
  if (!job || !['text', 'audio'].includes(job.kind)
      || !LOCAL_LANGUAGES.includes(job.targetLanguage)
      || (job.sourceLanguage !== 'auto' && !LOCAL_LANGUAGES.includes(job.sourceLanguage))) throw localLanguageError('failed');
  if (job.kind === 'text' && (typeof job.text !== 'string' || !job.text.trim()
      || job.text.length > LOCAL_TEXT_MAX_CHARACTERS)) throw localLanguageError('too_long');
  if (job.kind === 'audio' && (!(job.audio instanceof Float32Array) || !job.audio.length
      || job.audio.length > LOCAL_SAMPLE_RATE * LOCAL_AUDIO_MAX_SECONDS
      || job.audio.some(value => !Number.isFinite(value)))) throw localLanguageError('too_long');
}

export function splitLocalTranslationText(text, limit = 350) {
  const trimmed = text.trim();
  const sentences = trimmed.split(/(?<=[.!?؟।۔])\s+|\n+/u).filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= limit) { chunks.push(sentence); continue; }
    let part = '';
    for (const word of sentence.split(/\s+/u)) {
      if (word.length > limit) throw localLanguageError('too_long');
      if (part && part.length + word.length + 1 > limit) { chunks.push(part); part = ''; }
      part = part ? `${part} ${word}` : word;
    }
    if (part) chunks.push(part);
  }
  return chunks;
}

export function localVoiceForLanguage(voices, language) {
  const normalized = normalizeLocalLanguage(language, null);
  if (!normalized || !Array.isArray(voices)) return null;
  return voices.find(voice => voice.localService === true
    && normalizeLocalLanguage(voice.lang, null) === normalized) || null;
}
