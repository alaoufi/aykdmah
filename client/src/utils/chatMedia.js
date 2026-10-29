export const CHAT_MEDIA_MAX_FILES = 4;
export const CHAT_MEDIA_MAX_BYTES = 3.5 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 60;
export const VIDEO_MAX_SECONDS = 20;
export const CHAT_ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp3,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/x-m4a,video/mp4,video/webm,video/ogg,video/quicktime,.jpg,.jpeg,.png,.webp,.pdf,.mp3,.wav,.webm,.ogg,.m4a,.mp4,.mov,.ogv';
export const VIDEO_CAPTURE_CONSTRAINTS = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } },
  audio: true,
};

const EXTENSION_KIND = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  pdf: 'document', mp3: 'audio', m4a: 'audio', ogg: 'audio',
  wav: 'audio', mp4: 'video', mov: 'video', webm: 'video', ogv: 'video',
};
const MIME_KIND = {
  'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'application/pdf': 'document',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/wav': 'audio', 'audio/webm': 'audio',
  'audio/ogg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio',
  'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video', 'video/quicktime': 'video',
};
const MIME_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'], 'image/jpg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
  'application/pdf': ['pdf'], 'audio/mpeg': ['mp3'], 'audio/mp3': ['mp3'], 'audio/wav': ['wav'],
  'audio/webm': ['webm'], 'video/webm': ['webm'], 'audio/ogg': ['ogg', 'ogv'], 'video/ogg': ['ogg', 'ogv'],
  'audio/mp4': ['mp4', 'm4a'], 'audio/x-m4a': ['mp4', 'm4a'],
  'video/mp4': ['mp4', 'mov'], 'video/quicktime': ['mp4', 'mov'],
};

export function chatAttachmentKind(file) {
  const type = String(file?.type || '').toLowerCase().split(';')[0].trim();
  const extension = String(file?.name || '').toLowerCase().split('.').pop();
  if (MIME_KIND[type]) return MIME_EXTENSIONS[type].includes(extension) ? MIME_KIND[type] : null;
  // Some mobile camera pickers omit their MIME type. The server checks bytes.
  if (type && type !== 'application/octet-stream') return null;
  return EXTENSION_KIND[extension] || null;
}

export function addChatAttachments(current, selected) {
  const additions = Array.from(selected || []);
  if (!additions.length) return { files: current, error: null };
  const files = [...current, ...additions];
  if (files.length > CHAT_MEDIA_MAX_FILES || files.reduce((sum, file) => sum + file.size, 0) > CHAT_MEDIA_MAX_BYTES) {
    return { files: current, error: 'chat.media_limit' };
  }
  if (additions.some(file => !chatAttachmentKind(file))) return { files: current, error: 'chat.media_unsupported' };
  if (additions.some(file => !Number.isFinite(file.size) || file.size <= 0)) return { files: current, error: 'chat.media_empty' };
  return { files, error: null };
}

export function preferredVoiceMime(Recorder) {
  if (typeof Recorder?.isTypeSupported !== 'function') return '';
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
    .find(type => Recorder.isTypeSupported(type)) || '';
}

export function preferredVideoMime(Recorder) {
  if (typeof Recorder?.isTypeSupported !== 'function') return '';
  return ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm']
    .find(type => Recorder.isTypeSupported(type)) || '';
}

export function recordingErrorKey(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'chat.microphone_denied';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'chat.microphone_unavailable';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'chat.microphone_busy';
  return 'chat.recording_failed';
}

export function videoRecordingErrorKey(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'chat.camera_denied';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'chat.camera_unavailable';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return 'chat.camera_busy';
  return 'chat.video_recording_failed';
}

export function recordingTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Owns microphone lifetime separately from React and ignores cancelled requests. */
export function createVoiceRecording({
  getUserMedia, Recorder, onState, onDraft, onStream = () => {}, mediaKind = 'audio',
  createFile = (chunks, name, options) => new File(chunks, name, options),
  now = () => Date.now(),
  interval = callback => setInterval(callback, 250),
  clearInterval: clearTimer = timer => clearInterval(timer),
}) {
  const video = mediaKind === 'video';
  const maximumSeconds = video ? VIDEO_MAX_SECONDS : VOICE_MAX_SECONDS;
  const errorKey = video ? videoRecordingErrorKey : recordingErrorKey;
  let generation = 0;
  let disposed = false;
  let status = 'idle';
  let recorder = null;
  let stream = null;
  let timer = null;
  let chunks = [];
  let bytes = 0;
  let startedAt = 0;
  let maximumBytes = CHAT_MEDIA_MAX_BYTES;

  const publish = (next, error = null) => {
    status = next;
    if (!disposed) onState({ status, elapsedMs: next === 'idle' ? 0 : Math.min(now() - startedAt, maximumSeconds * 1000), error });
  };
  const release = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    if (!disposed) onStream(null);
    chunks = [];
    bytes = 0;
  };
  const cancel = (error = null) => {
    generation += 1;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch (_) { /* Tracks are still released below. */ }
      }
    }
    recorder = null;
    release();
    publish('idle', error);
  };
  const stop = () => {
    if (status !== 'recording' || !recorder || recorder.state !== 'recording') return;
    publish('stopping');
    try { recorder.stop(); } catch (error) { cancel(errorKey(error)); }
  };

  const start = async (availableBytes = CHAT_MEDIA_MAX_BYTES) => {
    if (disposed || status !== 'idle') return;
    if (typeof getUserMedia !== 'function' || !Recorder) {
      publish('idle', video ? 'chat.video_recording_unsupported' : 'chat.recording_unsupported');
      return;
    }
    if (availableBytes <= 0) { publish('idle', 'chat.media_limit'); return; }
    maximumBytes = Math.min(availableBytes, CHAT_MEDIA_MAX_BYTES);
    const request = ++generation;
    startedAt = now();
    publish('pending');
    let requestedStream;
    try {
      requestedStream = await getUserMedia(video ? VIDEO_CAPTURE_CONSTRAINTS : { audio: true });
      if (disposed || request !== generation) {
        requestedStream.getTracks().forEach(track => track.stop());
        return;
      }
      stream = requestedStream;
      const mimeType = video ? preferredVideoMime(Recorder) : preferredVoiceMime(Recorder);
      const active = new Recorder(stream, { audioBitsPerSecond: 48000, ...(video ? { videoBitsPerSecond: 384000 } : {}), ...(mimeType ? { mimeType } : {}) });
      recorder = active;
      chunks = [];
      bytes = 0;
      active.ondataavailable = event => {
        if (request !== generation || !event.data?.size) return;
        bytes += event.data.size;
        if (bytes > maximumBytes) { cancel('chat.media_limit'); return; }
        chunks.push(event.data);
      };
      active.onerror = event => {
        if (request === generation) cancel(errorKey(event.error));
      };
      active.onstop = () => {
        if (disposed || request !== generation) return;
        generation += 1;
        active.ondataavailable = null;
        active.onstop = null;
        active.onerror = null;
        const recordedChunks = chunks.slice();
        const type = active.mimeType || recordedChunks[0]?.type || mimeType || (video ? 'video/webm' : 'audio/webm');
        const durationSeconds = Math.max(1, Math.min(maximumSeconds, Math.ceil((now() - startedAt) / 1000)));
        recorder = null;
        release();
        if (!recordedChunks.length) { publish('idle', 'chat.media_empty'); return; }
        // Under a second holds no speech; say so instead of sending a silent note (AYK-047).
        if (!video && now() - startedAt < 1000) { publish('idle', 'chat.voice_too_short'); return; }
        const extension = type.includes('mp4') ? (video ? 'mp4' : 'm4a') : type.includes('ogg') ? 'ogg' : 'webm';
        try {
          // Recorder codec parameters belong to its configuration. A comma in
          // an unquoted multipart Content-Type can make parsers see text/plain.
          const fileType = type.split(';')[0].trim().toLowerCase();
          const file = createFile(recordedChunks, `${video ? 'video' : 'voice'}-${now()}.${extension}`, { type: fileType });
          if (!file.size) { publish('idle', 'chat.media_empty'); return; }
          if (file.size > maximumBytes) { publish('idle', 'chat.media_limit'); return; }
          publish('idle');
          onDraft(file, durationSeconds);
        } catch (error) { publish('idle', errorKey(error)); }
      };
      active.start(250);
      startedAt = now();
      publish('recording');
      if (!disposed) onStream(stream);
      timer = interval(() => {
        if (request !== generation || status !== 'recording') return;
        if (now() - startedAt >= maximumSeconds * 1000) stop();
        else publish('recording');
      });
    } catch (error) {
      if (request !== generation || disposed) {
        requestedStream?.getTracks().forEach(track => track.stop());
        return;
      }
      cancel(errorKey(error));
    }
  };

  return { start, stop, cancel, dispose() { disposed = true; cancel(); } };
}

export function createVideoRecording(options) {
  return createVoiceRecording({ ...options, mediaKind: 'video' });
}
