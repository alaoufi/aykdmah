import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceRecording, createVideoRecording } from '../utils/chatMedia';

const idleState = { status: 'idle', elapsedMs: 0, error: null };

export function useMediaRecording(onDraft, sessionKey, kind) {
  const [state, setState] = useState(idleState);
  const [stream, setStream] = useState(null);
  const controllerRef = useRef(null);
  const draftRef = useRef(onDraft);
  draftRef.current = onDraft;

  useEffect(() => {
    const devices = navigator.mediaDevices;
    const create = kind === 'video' ? createVideoRecording : createVoiceRecording;
    const controller = create({
      getUserMedia: devices?.getUserMedia ? options => devices.getUserMedia(options) : null,
      Recorder: globalThis.MediaRecorder,
      onState: setState,
      onStream: setStream,
      onDraft: file => draftRef.current(file),
    });
    controllerRef.current = controller;
    setState(idleState);
    setStream(null);
    const hidden = () => {
      if (document.hidden) controller.cancel();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [sessionKey, kind]);

  return {
    ...state,
    stream,
    start: useCallback(bytes => controllerRef.current?.start(bytes), []),
    stop: useCallback(() => controllerRef.current?.stop(), []),
    cancel: useCallback(() => controllerRef.current?.cancel(), []),
  };
}

export default function useVoiceRecording(onDraft, sessionKey) {
  return useMediaRecording(onDraft, sessionKey, 'audio');
}

export function useVideoRecording(onDraft, sessionKey) {
  return useMediaRecording(onDraft, sessionKey, 'video');
}
