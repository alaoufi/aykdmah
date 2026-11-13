import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addChatAttachments, chatAttachmentKind, CHAT_MEDIA_MAX_BYTES, CHAT_MEDIA_MAX_FILES,
  createVoiceRecording, createVideoRecording, preferredVoiceMime, preferredVideoMime,
  recordingErrorKey, videoRecordingErrorKey, recordingTime, VIDEO_CAPTURE_CONSTRAINTS,
  VIDEO_MAX_SECONDS, VOICE_MAX_SECONDS,
} from '../src/utils/chatMedia.js';

const sample = (name = 'clip.mp4', type = 'video/mp4', size = 10) => ({ name, type, size });
function harness({ media, supported = ['audio/webm;codecs=opus'], immediateStop = true, bytes = 12, kind = 'audio' } = {}) {
  let clock = 1000;
  let tick;
  let stoppedTracks = 0;
  let clearedTimers = 0;
  const states = [];
  const drafts = [];
  const previewStreams = [];
  const instances = [];
  const stream = { getTracks: () => Array.from({ length: kind === 'video' ? 2 : 1 }, () => ({ stop() { stoppedTracks += 1; } })) };
  class Recorder {
    static isTypeSupported(type) { return supported.includes(type); }
    constructor(recordedStream, options) {
      this.state = 'inactive'; this.mimeType = options.mimeType || 'audio/webm';
      this.options = options; assert.equal(recordedStream, stream); instances.push(this);
    }
    start(timeslice) { assert.equal(timeslice, 250); this.state = 'recording'; }
    chunk(size = bytes) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) }); }
    finish() { this.chunk(); this.onstop?.(); }
    stop() { this.state = 'inactive'; if (immediateStop) this.finish(); }
  }
  const create = kind === 'video' ? createVideoRecording : createVoiceRecording;
  const recorder = create({
    getUserMedia: media || (async options => { assert.deepEqual(options, kind === 'video' ? VIDEO_CAPTURE_CONSTRAINTS : { audio: true }); return stream; }),
    Recorder, onState: state => states.push(state), onDraft: (...draft) => drafts.push(draft),
    onStream: value => previewStreams.push(value),
    createFile: (chunks, name, options) => ({ name, type: options.type, size: chunks.reduce((sum, chunk) => sum + chunk.size, 0) }),
    now: () => clock, interval: callback => { tick = callback; return 1; },
    clearInterval: () => { clearedTimers += 1; tick = null; },
  });
  return { recorder, stream, states, drafts, instances, previewStreams,
    advance(milliseconds) { clock += milliseconds; tick?.(); },
    stopped: () => stoppedTracks, cleared: () => clearedTimers,
  };
}

test('attachment limits reject the whole selection and preserve the existing retry draft', () => {
  const current = [sample('voice.m4a', 'audio/mp4', CHAT_MEDIA_MAX_BYTES - 20)];
  const rejected = addChatAttachments(current, [sample('clip.mp4', 'video/mp4', 21)]);
  assert.equal(rejected.error, 'chat.media_limit'); assert.equal(rejected.files, current);
  assert.equal(addChatAttachments(current, [sample('clip.mp4', 'video/mp4', 20)]).files.length, 2);
  assert.equal(addChatAttachments(Array.from({ length: CHAT_MEDIA_MAX_FILES }, () => sample()), [sample()]).error, 'chat.media_limit');
  assert.equal(addChatAttachments([], [sample('empty.mp4', 'video/mp4', 0)]).error, 'chat.media_empty');
  assert.equal(addChatAttachments(current, [sample('bad.html', 'text/html', 1)]).files, current);
  assert.equal(addChatAttachments([], [sample('bad.svg', 'image/svg+xml')]).error, 'chat.media_unsupported');
});

test('mobile MIME omissions use supported extensions while an explicit unsupported MIME is rejected', () => {
  assert.equal(chatAttachmentKind(sample('CAMERA.MOV', '')), 'video');
  assert.equal(chatAttachmentKind(sample('voice.m4a', 'application/octet-stream')), 'audio');
  assert.equal(chatAttachmentKind(sample('voice.webm', 'audio/webm;codecs=opus')), 'audio');
  assert.equal(chatAttachmentKind(sample('photo.jpg', 'text/html')), null);
  assert.equal(chatAttachmentKind(sample('script.exe', '')), null);
  assert.equal(chatAttachmentKind(sample('clip.ogv', '')), 'video');
  assert.equal(chatAttachmentKind(sample('animation.gif', 'image/gif')), null);
  assert.equal(chatAttachmentKind(sample('animation.gif', '')), null);
  assert.equal(chatAttachmentKind(sample('voice.aac', 'audio/aac')), null);
  assert.equal(chatAttachmentKind(sample('voice.aac', '')), null);
  assert.equal(chatAttachmentKind(sample('unexpected.svg', 'image/png')), null);
  assert.equal(chatAttachmentKind(sample('unexpected.exe', 'audio/mp4')), null);
  assert.equal(chatAttachmentKind(sample('voice.wav', 'audio/mpeg')), null);
  assert.equal(chatAttachmentKind(sample('voice.m4a', 'video/mp4')), null);
  assert.equal(chatAttachmentKind(sample('clip.mov', 'video/mp4')), 'video');
});

test('supported recording container follows browser capabilities, including Safari MP4', () => {
  assert.equal(preferredVoiceMime({ isTypeSupported: type => type === 'audio/mp4' }), 'audio/mp4');
  assert.equal(preferredVoiceMime({ isTypeSupported: type => type.includes('webm') }), 'audio/webm;codecs=opus');
  assert.equal(preferredVoiceMime({}), '');
  assert.equal(recordingTime(0), '0:00'); assert.equal(recordingTime(60000), '1:00');
});

test('stopping produces a playable draft only; sending remains an explicit composer action', async () => {
  const h = harness({ supported: ['audio/mp4'] });
  await h.recorder.start(); h.advance(2400);
  assert.equal(h.drafts.length, 0); assert.equal(h.states.at(-1).status, 'recording');
  h.recorder.stop();
  assert.equal(h.drafts.length, 1); assert.equal(h.drafts[0][0].type, 'audio/mp4');
  assert.match(h.drafts[0][0].name, /\.m4a$/); assert.equal(h.drafts[0][1], 3);
  assert.equal(h.stopped(), 1); assert.equal(h.cleared(), 1);
  assert.equal(h.states.at(-1).status, 'idle');
  h.recorder.dispose();
});

test('cancelled permission requests release late microphone streams and cannot create a draft', async () => {
  let resolve;
  const h = harness({ media: () => new Promise(done => { resolve = done; }) });
  const pending = h.recorder.start(); assert.equal(h.states.at(-1).status, 'pending');
  h.recorder.cancel(); resolve(h.stream); await pending;
  assert.equal(h.stopped(), 1); assert.equal(h.instances.length, 0); assert.equal(h.drafts.length, 0);
});

test('a newer recording is not cancelled by a late stream from the previous permission request', async () => {
  const resolvers = [];
  const h = harness({ media: () => new Promise(done => resolvers.push(done)) });
  const old = h.recorder.start(); h.recorder.cancel(); const fresh = h.recorder.start();
  resolvers[1](h.stream); await fresh; resolvers[0](h.stream); await old;
  assert.equal(h.instances.length, 1); assert.equal(h.states.at(-1).status, 'recording');
  h.advance(1000); h.recorder.stop(); assert.equal(h.drafts.length, 1); assert.equal(h.stopped(), 2);
});

test('recording cancellation and disposal detach late stop/data events and release every track', async () => {
  for (const dispose of [false, true]) {
    const h = harness({ immediateStop: false }); await h.recorder.start();
    const instance = h.instances[0]; const staleStop = instance.onstop; const staleData = instance.ondataavailable;
    if (dispose) h.recorder.dispose(); else h.recorder.cancel();
    staleData({ data: new Blob(['late']) }); staleStop();
    assert.equal(h.drafts.length, 0); assert.equal(h.stopped(), 1); assert.equal(h.cleared(), 1);
    assert.equal(instance.onstop, null); assert.equal(instance.ondataavailable, null);
  }
});

test('maximum duration stops automatically into a preview and releases the microphone', async () => {
  const h = harness(); await h.recorder.start(); h.advance(VOICE_MAX_SECONDS * 1000);
  assert.equal(h.drafts.length, 1); assert.equal(h.drafts[0][1], VOICE_MAX_SECONDS);
  assert.equal(h.states.at(-1).status, 'idle'); assert.equal(h.stopped(), 1);
});

test('streaming size guard discards oversized recording without replacing an existing draft', async () => {
  const h = harness(); await h.recorder.start(8); h.instances[0].chunk(9);
  assert.equal(h.drafts.length, 0); assert.equal(h.stopped(), 1);
  assert.equal(h.states.at(-1).error, 'chat.media_limit'); assert.equal(h.states.at(-1).status, 'idle');
});

test('zero-byte recording yields a localized error and releases tracks', async () => {
  const h = harness({ bytes: 0 }); await h.recorder.start(); h.recorder.stop();
  assert.equal(h.drafts.length, 0); assert.equal(h.states.at(-1).error, 'chat.media_empty'); assert.equal(h.stopped(), 1);
});

test('permission and device errors map to native-language messages and remain retryable', async () => {
  for (const [name, key] of [['NotAllowedError', 'chat.microphone_denied'], ['NotFoundError', 'chat.microphone_unavailable'], ['NotReadableError', 'chat.microphone_busy']]) {
    let fail = true;
    const h = harness({ media: async () => { if (fail) throw { name }; return h.stream; } });
    await h.recorder.start(); assert.equal(h.states.at(-1).error, key); assert.equal(h.states.at(-1).status, 'idle');
    fail = false; await h.recorder.start(); h.advance(1000); h.recorder.stop(); assert.equal(h.drafts.length, 1);
  }
  assert.equal(recordingErrorKey({ name: 'UnknownError' }), 'chat.recording_failed');
});

test('a constructor failure releases the acquired microphone and publishes a localized error', async () => {
  let stopped = 0; const states = [];
  const h = createVoiceRecording({ getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }),
    Recorder: class { constructor() { throw { name: 'NotReadableError' }; } },
    onState: state => states.push(state), onDraft: () => assert.fail('Failed recorder must not create a draft'),
  });
  await h.start(); assert.equal(stopped, 1); assert.equal(states.at(-1).error, 'chat.microphone_busy');
});

test('video recording requests camera only after start and uses bounded quality and Safari MP4 capabilities', async () => {
  const h = harness({ kind: 'video', supported: ['video/mp4'] });
  assert.equal(h.instances.length, 0); assert.equal(h.previewStreams.length, 0);
  assert.deepEqual(VIDEO_CAPTURE_CONSTRAINTS.video.facingMode, { ideal: 'environment' });
  assert.deepEqual(VIDEO_CAPTURE_CONSTRAINTS.video.width, { ideal: 640 });
  assert.deepEqual(VIDEO_CAPTURE_CONSTRAINTS.video.height, { ideal: 360 });
  assert.deepEqual(VIDEO_CAPTURE_CONSTRAINTS.video.frameRate, { ideal: 15, max: 15 });
  await h.recorder.start();
  assert.equal(h.instances[0].options.videoBitsPerSecond, 384000);
  assert.equal(h.instances[0].options.audioBitsPerSecond, 48000);
  assert.equal(h.instances[0].mimeType, 'video/mp4'); assert.equal(h.previewStreams.at(-1), h.stream);
  h.recorder.stop();
  assert.match(h.drafts[0][0].name, /\.mp4$/); assert.equal(h.drafts[0][0].type, 'video/mp4');
  assert.equal(h.previewStreams.at(-1), null); assert.equal(h.stopped(), 2);
  assert.equal(preferredVideoMime({ isTypeSupported: type => type.includes('webm') }), 'video/webm;codecs=vp8,opus');
});

test('short video stops at twenty seconds into a preview, never sends, and releases camera and microphone', async () => {
  const h = harness({ kind: 'video', supported: ['video/webm;codecs=vp8,opus'] });
  await h.recorder.start(); h.advance(19000); assert.equal(h.drafts.length, 0);
  h.advance(1000); assert.equal(h.drafts.length, 1); assert.equal(h.drafts[0][1], VIDEO_MAX_SECONDS);
  assert.equal(h.states.at(-1).status, 'idle'); assert.equal(h.stopped(), 2); assert.equal(h.cleared(), 1);
});

test('cancelling a pending camera permission or disposing active video prevents all late drafts', async () => {
  let resolve;
  const pending = harness({ kind: 'video', media: () => new Promise(done => { resolve = done; }) });
  const started = pending.recorder.start(); pending.recorder.cancel(); resolve(pending.stream); await started;
  assert.equal(pending.stopped(), 2); assert.equal(pending.drafts.length, 0); assert.equal(pending.instances.length, 0);
  const active = harness({ kind: 'video', immediateStop: false }); await active.recorder.start();
  const staleStop = active.instances[0].onstop; active.recorder.dispose(); staleStop();
  assert.equal(active.stopped(), 2); assert.equal(active.drafts.length, 0);
});

test('video recording respects remaining multipart byte budget and reports localized camera errors', async () => {
  const h = harness({ kind: 'video' }); await h.recorder.start(5); h.instances[0].chunk(6);
  assert.equal(h.drafts.length, 0); assert.equal(h.states.at(-1).error, 'chat.media_limit'); assert.equal(h.stopped(), 2);
  for (const [name, key] of [['NotAllowedError', 'chat.camera_denied'], ['NotFoundError', 'chat.camera_unavailable'], ['NotReadableError', 'chat.camera_busy']]) {
    assert.equal(videoRecordingErrorKey({ name }), key);
    const denied = harness({ kind: 'video', media: async () => { throw { name }; } });
    await denied.recorder.start(); assert.equal(denied.states.at(-1).error, key); assert.equal(denied.drafts.length, 0);
  }
});

test('recorded file MIME excludes codec parameters so real multipart uploads remain valid', async () => {
  for (const [mime, kind, expected] of [
    ['video/webm;codecs=vp8,opus', 'video', 'video/webm'],
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video', 'video/mp4'],
    ['audio/webm;codecs=opus', 'audio', 'audio/webm'],
  ]) {
    const h = harness({ kind, supported: [kind === 'video' ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus'] });
    await h.recorder.start(); h.instances[0].mimeType = mime; h.advance(1000); h.recorder.stop();
    assert.equal(h.drafts[0][0].type, expected);
    assert.equal(h.drafts[0][0].type.includes(';'), false);
    assert.equal(h.instances[0].options.mimeType.includes('codecs='), true);
  }
});

test('a voice note under one second is not sent and says it was too short (AYK-047)', async () => {
  const h = harness(); await h.recorder.start(); h.advance(400); h.recorder.stop();
  assert.equal(h.drafts.length, 0); assert.equal(h.states.at(-1).error, 'chat.voice_too_short'); assert.equal(h.stopped(), 1);
});
