import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import * as calls from '../services/callService';

// The call screen and the LiveKit SDK load only when a call actually starts or rings.
const CallOverlay = lazy(() => import('../components/calls/CallOverlay'));
const loadLiveKit = () => import('livekit-client');

const CallContext = createContext(null);
const FINAL = ['rejected', 'missed', 'cancelled', 'ended', 'failed'];

// phase: idle | outgoing | incoming | connecting | in_call | reconnecting | ended
export function CallProvider({ children }) {
  const { user } = useAuth();
  const { socketRef, connected } = useSocket();
  const [call, setCall] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [room, setRoom] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState('user');
  const [remoteJoined, setRemoteJoined] = useState(false);
  const roomRef = useRef(null);
  const callRef = useRef(null);
  const leavingRef = useRef(false);
  callRef.current = call;

  const teardown = useCallback(async () => {
    const current = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    setRemoteJoined(false);
    // Disconnecting with stopTracks releases the camera and microphone.
    if (current) { try { await current.disconnect(true); } catch (_) { /* already closed */ } }
  }, []);

  const finishLocally = useCallback(async (finalCall, reason) => {
    await teardown();
    setCall(finalCall ? { ...finalCall, end_reason: finalCall.end_reason || reason } : null);
    setPhase(finalCall ? 'ended' : 'idle');
    // Keep the outcome on screen briefly, then close.
    setTimeout(() => {
      if (!roomRef.current && FINAL.includes(callRef.current?.status || 'ended')) { setCall(null); setPhase('idle'); }
    }, 2500);
  }, [teardown]);

  const connectMedia = useCallback(async (active) => {
    setPhase(prev => (prev === 'outgoing' ? 'outgoing' : 'connecting'));
    const [{ Room, RoomEvent, Track }, access] = await Promise.all([loadLiveKit(), calls.callToken(active.id)]);
    const lkRoom = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: true });
    lkRoom
      .on(RoomEvent.ParticipantConnected, () => setRemoteJoined(true))
      .on(RoomEvent.ParticipantDisconnected, () => setRemoteJoined(false))
      .on(RoomEvent.Reconnecting, () => setPhase('reconnecting'))
      .on(RoomEvent.Reconnected, () => setPhase('in_call'))
      .on(RoomEvent.Disconnected, () => {
        if (leavingRef.current || roomRef.current !== lkRoom) return;
        // Lost the media connection for good: end the call on the server too.
        calls.declineCall(active.id).then(c => finishLocally(c, 'network')).catch(() => finishLocally(null, 'network'));
      });
    roomRef.current = lkRoom;
    setRoom(lkRoom);
    await lkRoom.connect(access.url, access.token, { autoSubscribe: true });
    setRemoteJoined(lkRoom.remoteParticipants.size > 0);
    await lkRoom.localParticipant.setMicrophoneEnabled(true);
    if (active.call_type === 'video') {
      await lkRoom.localParticipant.setCameraEnabled(true, { facingMode: 'user' });
    }
    setMicOn(true);
    setCamOn(active.call_type === 'video');
    setFacing('user');
    if (active.status === 'accepted') setPhase('in_call');
    return Track;
  }, [finishLocally]);

  const applyState = useCallback(async (next) => {
    if (!next) return;
    const current = callRef.current;
    if (current && current.id !== next.id && !FINAL.includes(next.status)) return; // one call at a time
    if (FINAL.includes(next.status)) {
      if (current?.id === next.id) await finishLocally(next);
      return;
    }
    setCall(next);
    if (next.status === 'accepted') {
      if (roomRef.current) setPhase('in_call');
      // Accepted on another of this user's devices: this one stops ringing.
      else if (next.direction === 'incoming' && current?.id === next.id && phase === 'incoming') { setCall(null); setPhase('idle'); }
    }
  }, [finishLocally, phase]);

  // Realtime events, with a slow poll as a fallback when the socket is down.
  useEffect(() => {
    if (!user) return undefined;
    const socket = socketRef?.current;
    const onIncoming = c => {
      if (callRef.current) return;
      setError(null);
      setCall(c);
      setPhase('incoming');
      navigator.vibrate?.([300, 200, 300]);
    };
    const onState = c => { applyState(c); };
    socket?.on('call:incoming', onIncoming);
    socket?.on('call:state', onState);
    let timer = null;
    const poll = async () => {
      try {
        const list = await calls.activeCalls();
        const current = callRef.current;
        if (current) {
          const same = list.find(c => c.id === current.id);
          if (!same && phase !== 'idle' && phase !== 'ended') await finishLocally({ ...current, status: 'ended' });
          else if (same) await applyState(same);
        } else {
          const ringing = list.find(c => c.direction === 'incoming' && c.status === 'ringing');
          if (ringing) onIncoming(ringing);
        }
      } catch (_) { /* offline: try again next tick */ }
    };
    poll();
    timer = setInterval(poll, connected ? 20000 : 5000);
    return () => {
      socket?.off('call:incoming', onIncoming);
      socket?.off('call:state', onState);
      clearInterval(timer);
    };
  }, [user, socketRef, connected, applyState, finishLocally, phase]);

  // Release devices if the user signs out mid-call.
  useEffect(() => { if (!user) { teardown(); setCall(null); setPhase('idle'); } }, [user, teardown]);

  const start = useCallback(async (conversationId, callType) => {
    if (callRef.current) return;
    setError(null);
    leavingRef.current = false;
    try {
      const created = await calls.startCall(conversationId, callType);
      setCall(created);
      setPhase('outgoing');
      await connectMedia(created);
    } catch (err) {
      const code = err?.response?.data?.message || (err?.name === 'NotAllowedError' ? 'media_denied' : 'call_failed');
      setError(code);
      const current = callRef.current;
      if (current) calls.declineCall(current.id).catch(() => {});
      await finishLocally(null);
      setPhase('ended');
      setCall({ status: 'failed', end_reason: code, call_type: callType, peer: {} });
    }
  }, [connectMedia, finishLocally]);

  const accept = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    leavingRef.current = false;
    try {
      const accepted = await calls.acceptCall(current.id);
      setCall(accepted);
      await connectMedia(accepted);
      setPhase('in_call');
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'media_denied' : err?.response?.data?.message || 'call_failed');
      calls.declineCall(current.id).catch(() => {});
      await finishLocally({ ...current, status: 'failed' });
    }
  }, [connectMedia, finishLocally]);

  const hangup = useCallback(async () => {
    const current = callRef.current;
    leavingRef.current = true;
    if (!current?.id) { await finishLocally(null); return; }
    try { await finishLocally(await calls.declineCall(current.id)); }
    catch (_) { await finishLocally({ ...current, status: 'ended' }); }
  }, [finishLocally]);

  const toggleMic = useCallback(async () => {
    const lk = roomRef.current; if (!lk) return;
    await lk.localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(!micOn);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const lk = roomRef.current; if (!lk || callRef.current?.call_type !== 'video') return;
    await lk.localParticipant.setCameraEnabled(!camOn, { facingMode: facing });
    setCamOn(!camOn);
  }, [camOn, facing]);

  const switchCamera = useCallback(async () => {
    const lk = roomRef.current; if (!lk || !camOn) return;
    const { Track } = await loadLiveKit();
    const next = facing === 'user' ? 'environment' : 'user';
    const track = lk.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    try { await track?.restartTrack({ facingMode: next }); setFacing(next); }
    catch (_) { setError('camera_switch_failed'); }
  }, [camOn, facing]);

  const value = { call, phase, error, room, micOn, camOn, facing, remoteJoined, start, accept, hangup, toggleMic, toggleCam, switchCamera };
  return (
    <CallContext.Provider value={value}>
      {children}
      {call && <Suspense fallback={null}><CallOverlay /></Suspense>}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
