// Per-call intent survives a replacement Room; a fresh call always starts camera-off.
export function createCallMediaIntent() {
  let state = { id: null, mic: true, camera: false, facing: 'user', output: '' };
  let generation = 0;
  let cameraQueue = Promise.resolve();
  let cameraRequest = 0;
  const stopTracks = room => { for (const p of room.localParticipant.trackPublications?.values() || []) p.track?.stop(); };
  return {
    get state() { return state; },
    begin(id) {
      if (state.id !== id) { generation += 1; cameraQueue = Promise.resolve(); state = { id, mic: true, camera: false, facing: 'user', output: '' }; }
      return state;
    },
    end() { generation += 1; state.camera = false; state.id = null; },
    async restore(room, options = {}) {
      const current = generation;
      const valid = () => current === generation && options.valid?.() !== false;
      let mic = false; let camera = false;
      try {
        if (!valid()) return { mic, camera };
        mic = (await (options.microphone || (value => room.localParticipant.setMicrophoneEnabled(value)))(state.mic)) !== false && state.mic;
        if (valid() && state.camera) camera = await this.setCamera(room, true, valid, options.camera);
        return { mic, camera };
      } finally { if (!valid()) stopTracks(room); }
    },
    setCamera(room, wanted, valid = () => true, enable = null) {
      state.camera = wanted;
      const current = generation;
      const request = ++cameraRequest;
      const facing = state.facing;
      const run = async () => {
        if (current !== generation || !valid()) return false;
        try {
          const result = enable ? await enable(facing) : await room.localParticipant.setCameraEnabled(wanted, { facingMode: facing });
          if (result === false && current === generation && request === cameraRequest) state.camera = false;
          return result !== false && wanted;
        } catch (error) { if (current === generation && request === cameraRequest) state.camera = false; throw error; }
        finally { if (current !== generation || !valid()) stopTracks(room); }
      };
      const result = cameraQueue.then(run, run);
      cameraQueue = result.catch(() => {});
      return result;
    },
  };
}

export function preferredCallOutput(devices, explicit, current) {
  if (explicit && devices.some(d => d.deviceId === explicit)) return explicit;
  const active = devices.find(d => d.deviceId === current);
  // Default/unknown routes may already be a user's Bluetooth or wired selection.
  // Only override a clearly identified built-in earpiece, never guess by array order.
  if (!active || !/earpiece|receiver/i.test(active.label || '')) return '';
  return devices.find(d => /speaker(phone)?|loudspeaker/i.test(d.label || '') && !/head|bluetooth|usb/i.test(d.label || ''))?.deviceId || '';
}
