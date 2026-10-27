import api, { getToken } from '../services/api';
import {
  LOCAL_AUDIO_MAX_BYTES, LOCAL_AUDIO_MAX_SECONDS, LOCAL_SAMPLE_RATE,
  abortLocalLanguage, authorizedMediaPath, localLanguageError,
} from './localLanguage.js';

function checkCurrent(signal, isCurrent) {
  if (signal?.aborted || !isCurrent()) throw abortLocalLanguage();
}

function mediaDuration(bytes, type, signal) {
  return new Promise((resolve, reject) => {
    const element = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    let finished = false;
    const finish = (error, duration) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.ondurationchange = null;
      element.ontimeupdate = null;
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(duration);
    };
    const aborted = () => finish(abortLocalLanguage());
    const timer = setTimeout(() => finish(localLanguageError('audio_unsupported')), 10000);
    element.preload = 'metadata';
    element.muted = true;
    const readDuration = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) return false;
      else if (element.duration > LOCAL_AUDIO_MAX_SECONDS + 0.05) finish(localLanguageError('too_long'));
      else finish(null, element.duration);
      return true;
    };
    element.onloadedmetadata = () => {
      if (readDuration()) return;
      // MediaRecorder WebM often omits duration in its header. Seeking a paused
      // local blob to its end obtains the actual duration without playing it.
      if (/webm/.test(type)) {
        element.ondurationchange = readDuration;
        element.ontimeupdate = readDuration;
        try { element.currentTime = Number.MAX_SAFE_INTEGER; } catch { finish(localLanguageError('audio_unsupported')); }
      } else finish(localLanguageError('audio_unsupported'));
    };
    element.onerror = () => finish(localLanguageError('audio_unsupported'));
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    element.src = url;
  });
}

export async function recordedAudioSamples(file, { signal, isCurrent }) {
  checkCurrent(signal, isCurrent);
  const type = String(file?.file_type || '');
  if (!/^(audio|video)\//.test(type) || !getToken()) throw localLanguageError('private_file_unavailable');
  if (Number(file.file_size) > LOCAL_AUDIO_MAX_BYTES) throw localLanguageError('too_long');
  const pageOrigin = window.location.origin;
  const apiOrigin = new URL(import.meta.env.VITE_API_URL || pageOrigin, pageOrigin).origin;
  const path = authorizedMediaPath(file.file_url, pageOrigin, apiOrigin);
  if (!path) throw localLanguageError('private_file_unavailable');
  // Authorization can only go to our configured API, never an attachment host.
  const token = getToken();
  const response = await api.get(path, {
    signal, responseType: 'arraybuffer', headers: { Authorization: `Bearer ${token}` },
  });
  checkCurrent(signal, isCurrent);
  if (getToken() !== token) throw abortLocalLanguage();
  const bytes = response.data;
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > LOCAL_AUDIO_MAX_BYTES) throw localLanguageError('too_long');
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw localLanguageError('audio_unsupported');
  // Read duration before decoding to reject long, highly compressed recordings.
  const duration = await mediaDuration(bytes, type, signal);
  checkCurrent(signal, isCurrent);
  let decoded;
  try {
    const context = new OfflineContext(1, Math.max(1, Math.ceil(duration * LOCAL_SAMPLE_RATE)), LOCAL_SAMPLE_RATE);
    decoded = await context.decodeAudioData(bytes.slice(0));
  } catch { throw localLanguageError('audio_unsupported'); }
  checkCurrent(signal, isCurrent);
  if (!decoded?.numberOfChannels || decoded.duration > LOCAL_AUDIO_MAX_SECONDS + 0.05
      || decoded.sampleRate !== LOCAL_SAMPLE_RATE || decoded.length > LOCAL_SAMPLE_RATE * LOCAL_AUDIO_MAX_SECONDS) throw localLanguageError('too_long');
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const values = decoded.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += values[index] / decoded.numberOfChannels;
  }
  return mono;
}
