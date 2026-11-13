import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallMediaIntent, preferredCallOutput } from '../src/utils/callMediaIntent.js';

test('new calls never capture a camera and reconnect keeps explicit microphone/camera/facing choices', async () => {
  const intent = createCallMediaIntent();
  intent.begin(1);
  const actions = [];
  const room = { localParticipant: {
    setMicrophoneEnabled: async value => actions.push(['mic', value]),
    setCameraEnabled: async (value, options) => actions.push(['cam', value, options.facingMode]),
  } };
  await intent.restore(room);
  assert.deepEqual(actions, [['mic', true]]);
  intent.state.mic = false; intent.state.camera = true; intent.state.facing = 'environment';
  intent.begin(1);
  await intent.restore(room);
  assert.deepEqual(actions.slice(1), [['mic', false], ['cam', true, 'environment']]);
  intent.begin(2);
  assert.deepEqual(intent.state, { id: 2, mic: true, camera: false, facing: 'user', output: '' });
});

test('ending during a pending camera publish stops the late track and cannot restore capture', async () => {
  const intent = createCallMediaIntent(); intent.begin(1); intent.state.camera = true;
  let release; let stopped = 0;
  const room = { localParticipant: {
    setMicrophoneEnabled: async () => {},
    setCameraEnabled: () => new Promise(resolve => { release = resolve; }),
    trackPublications: new Map([['cam', { track: { stop: () => { stopped += 1; } } }]]),
  } };
  const pending = intent.restore(room);
  while (!release) await Promise.resolve(); intent.end(); release(); await pending;
  assert.ok(stopped >= 1, 'the late publication must release its capture');
  assert.equal(intent.state.camera, false);
});

test('camera off queues after a pending on and a refused camera leaves voice intact', async () => {
  const intent = createCallMediaIntent(); intent.begin(1);
  let release; const actions = [];
  const room = { localParticipant: { setCameraEnabled: value => {
    actions.push(value);
    return value ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  } } };
  const on = intent.setCamera(room, true);
  while (!release) await Promise.resolve();
  const off = intent.setCamera(room, false);
  assert.equal(intent.state.camera, false);
  assert.deepEqual(actions, [true]);
  release(); await Promise.all([on, off]);
  assert.deepEqual(actions, [true, false]);
  room.localParticipant.setCameraEnabled = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  await assert.rejects(intent.setCamera(room, true), { name: 'NotAllowedError' });
  assert.equal(intent.state.camera, false);
  assert.equal(intent.state.mic, true);
});

test('output policy preserves explicit/default external route and only requests an identifiable speaker', () => {
  const devices = [{ deviceId: 'default', label: 'Default - Bluetooth headset' }, { deviceId: 'sp', label: 'Speakerphone' }];
  assert.equal(preferredCallOutput(devices, '', 'default'), '');
  assert.equal(preferredCallOutput(devices, 'sp', 'default'), 'sp');
  assert.equal(preferredCallOutput([{ deviceId: 'default', label: '' }], '', 'default'), '');
  assert.equal(preferredCallOutput([{ deviceId: 'ear', label: 'Earpiece' }, devices[1]], '', 'ear'), 'sp');
});

test('an older rejected camera request cannot erase a newer explicit on choice', async () => {
  const intent = createCallMediaIntent(); intent.begin(1);
  let rejectFirst; let calls = 0;
  const room = { localParticipant: { setCameraEnabled: async () => {
    calls += 1;
    if (calls === 1) await new Promise((_, reject) => { rejectFirst = reject; });
  } } };
  const first = intent.setCamera(room, true).catch(() => false);
  while (!rejectFirst) await Promise.resolve();
  const off = intent.setCamera(room, false);
  const retry = intent.setCamera(room, true);
  rejectFirst(new Error('temporary failure'));
  await Promise.all([first, off, retry]);
  assert.equal(intent.state.camera, true);
});
