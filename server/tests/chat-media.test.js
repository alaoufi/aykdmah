const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures/chat-media.json');
const { validateUpload, uploadHeaderAllowed } = require('../utils/uploadValidation');
const { validateChatMessage, recordingDuration } = require('../utils/chatMessageValidation');
const { ALLOWED_FILE_TYPES } = require('../config/constants');
const { translate, SUPPORTED } = require('../utils/i18n');
const allowed = [...ALLOWED_FILE_TYPES.AUDIO, ...ALLOWED_FILE_TYPES.VIDEO];
const media = name => Buffer.from(fixtures[name], 'base64');

// Tiny real files generated with FFmpeg from a 0.1-second sine wave or a
// 16x16 blue frame. Fixtures need no decoder or native tool during tests.
test('real Chromium/Safari audio and MP4/WebM/MOV videos derive MIME from tracks', () => {
  for (const [name, mime] of [
    ['voice.webm', 'audio/webm'], ['voice.m4a', 'audio/mp4'], ['voice.ogg', 'audio/ogg'], ['voice.wav', 'audio/wav'],
    ['video.webm', 'video/webm'], ['video.mp4', 'video/mp4'], ['video.mov', 'video/quicktime'], ['video.ogv', 'video/ogg'],
  ]) {
    const file = validateUpload({ buffer: media(name), originalname: name, mimetype: mime }, allowed);
    assert.equal(file.mimetype, mime, name);
  }
  assert.equal(validateUpload({ buffer: media('voice.m4a'), originalname: 'recording.mp4', mimetype: 'video/mp4' }, allowed).mimetype, 'audio/mp4');
  assert.equal(validateUpload({ buffer: media('video.webm'), originalname: 'clip.webm', mimetype: 'audio/webm' }, allowed).mimetype, 'video/webm');
  assert.throws(() => validateUpload({ buffer: media('video.webm'), originalname: 'clip.webm', mimetype: 'audio/webm' }, ALLOWED_FILE_TYPES.AUDIO));
  assert.throws(() => validateUpload({ buffer: media('voice.m4a'), originalname: 'voice.mp4', mimetype: 'video/mp4' }, ALLOWED_FILE_TYPES.VIDEO));
});

test('missing mobile MIME headers are sniffed without guessing the shared-container track kind', () => {
  for (const mimetype of ['', undefined, 'application/octet-stream']) {
    for (const [name, expected] of [['voice.m4a', 'audio/mp4'], ['voice.webm', 'audio/webm'], ['video.mp4', 'video/mp4'], ['video.webm', 'video/webm'], ['video.ogv', 'video/ogg']]) {
      const file = { originalname: name, mimetype, buffer: media(name) };
      assert.equal(uploadHeaderAllowed(file, allowed), true);
      assert.equal(validateUpload(file, allowed).mimetype, expected);
    }
  }
  assert.equal(uploadHeaderAllowed({ originalname: 'video.webm', mimetype: '' }, ALLOWED_FILE_TYPES.AUDIO), true);
  assert.throws(() => validateUpload({ originalname: 'video.webm', mimetype: '', buffer: media('video.webm') }, ALLOWED_FILE_TYPES.AUDIO));
  for (const [originalname, mimetype, buffer] of [
    ['fake.mp4', '', Buffer.from('<script>evil</script>')], ['fake.webm', 'application/octet-stream', Buffer.from('1a45dfa37765626d', 'hex')],
    ['fake.svg', 'application/octet-stream', Buffer.from('<svg/>')], ['fake.exe', '', Buffer.from('MZ')],
    ['video.mp4', 'application/x-malware', media('video.mp4')], ['video.mp4', 'image/png', media('video.mp4')],
  ]) assert.throws(() => validateUpload({ originalname, mimetype, buffer }, allowed), { status: 400 });
  assert.equal(uploadHeaderAllowed({ originalname: 'video.mp4', mimetype: 'application/x-malware' }, allowed), false);
});

test('streaming WebM with an unknown Segment size remains valid', () => {
  const bytes = media('voice.webm'), offset = bytes.indexOf(Buffer.from('18538067', 'hex')) + 4;
  let mask = 0x80, length = 1;
  while (!(bytes[offset] & mask)) { mask >>= 1; length++; }
  bytes[offset] = mask | (mask - 1);
  bytes.fill(0xff, offset + 1, offset + length);
  assert.equal(validateUpload({ buffer: bytes, originalname: 'voice.webm', mimetype: 'audio/webm' }, allowed).mimetype, 'audio/webm');
});

test('spoofed headers, missing tracks/media, malformed sizes and disguised video fail closed', () => {
  const header = Buffer.alloc(16); header.writeUInt32BE(16); header.write('ftyp', 4); header.write('isom', 8);
  for (const [buffer, originalname, mimetype] of [
    [header, 'fake.mp4', 'video/mp4'], [Buffer.concat([header, Buffer.from('<script>bad</script>')]), 'fake.mp4', 'video/mp4'],
    [Buffer.from('1a45dfa37765626d', 'hex'), 'fake.webm', 'video/webm'],
    [Buffer.concat([Buffer.from('OggS'), Buffer.alloc(23)]), 'fake.ogg', 'audio/ogg'],
    [media('video.mp4'), 'fake.m4a', 'audio/mp4'], [media('voice.m4a'), 'fake.mov', 'video/quicktime'],
    [media('video.mp4').subarray(0, 80), 'truncated.mp4', 'video/mp4'],
    [media('video.webm').subarray(0, 80), 'truncated.webm', 'video/webm'],
    [media('voice.ogg').subarray(0, 80), 'truncated.ogg', 'audio/ogg'],
  ]) assert.throws(() => validateUpload({ buffer, originalname, mimetype }, allowed), { status: 400 });
  const oversized = media('video.mp4'); oversized.writeUInt32BE(0xffffffff, 0);
  assert.throws(() => validateUpload({ buffer: oversized, originalname: 'fake.mp4', mimetype: 'video/mp4' }, allowed), { status: 400 });
});

test('voice requires actual audio; bounded duration is optional client metadata', () => {
  const audio = { mimetype: 'audio/mp4' }, video = { mimetype: 'video/mp4' };
  assert.doesNotThrow(() => validateChatMessage({ message_type: 'voice', files: [audio] }));
  assert.throws(() => validateChatMessage({ message_type: 'voice', files: [video] }));
  assert.throws(() => validateChatMessage({ message_type: 'voice', content: 'not a recording' }));
  assert.throws(() => validateChatMessage({ message_type: 'system', content: 'pretend system' }));
  assert.equal(recordingDuration('60', [audio]), 60);
  assert.equal(recordingDuration(undefined, [audio]), null);
  for (const value of [0, '-1', '60.5', '601', 'Infinity', 'NaN', [], {}, true]) assert.throws(() => recordingDuration(value, [audio]));
  assert.throws(() => recordingDuration('60', [audio, video]));
  assert.throws(() => recordingDuration('60', [{ mimetype: 'image/png' }]));
  assert.throws(() => validateChatMessage({ message_type: 'voice', files: [{ ...audio, duration_seconds: 60.5 }] }));
});

test('media validation and total body limit guidance has native translations', () => {
  const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };
  for (const key of ['file_content_invalid', 'upload_body_limit']) {
    for (const language of SUPPORTED) {
      assert.notEqual(translate(language, key), key);
      assert.match(translate(language, key), scripts[language]);
      if (language !== 'en') assert.notEqual(translate(language, key), translate('en', key));
    }
  }
});
