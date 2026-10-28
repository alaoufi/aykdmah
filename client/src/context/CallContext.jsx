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

  // Set before tearing down, so a connection that this teardown interrupts
  // (declined while still connecting) does not report itself as a failure.
  const endingRef = useRef(false);
  const finishLocally = useCallback(async (finalCall, reason) => {
    endingRef.current = true;
    await teardown();
    setCall(finalCall ? { ...finalCall, end_reason: finalCall.end_reason || reason } : null);
    setPhase(finalCall ? 'ended' : 'idle');
    // Keep the outcome on screen briefly, then close.
    setTimeout(() => {
      if (!roomRef.current && FINAL.includes(callRef.current?.status || 'ended')) { setCall(null); setPhase('idle'); }
    }, 2500);
  }, [teardown]);

  // The server's record decides the outcome shown (declined, missed, ended…).
  const finalState = async (active) => {
    try {
      const rows = await calls.callHistory({ conversation_id: active.conversation_id });
      return rows.find(c => c.id === active.id) || { ...active, status: 'ended' };
    } catch (_) { return { ...active, status: 'ended' }; }
  };

  // After a network drop LiveKit may give up while offline. Rejoin the same call with a
  // fresh token for up to 30 s; end it only if that fails or the call is over.
  const rejoinRef = useRef(null);
  const rejoin = useCallback(async (active) => {
    if (rejoinRef.current) return;
    rejoinRef.current = true;
    setPhase('reconnecting');
    try {
      for (let attempt = 0; attempt < 10 && !leavingRef.current; attempt += 1) {
        if (attempt > 0 || navigator.onLine === false) await new Promise(resolve => setTimeout(resolve, 3000));
        if (navigator.onLine === false) continue;
        try {
          const list = await calls.activeCalls();
          const current = list.find(c => c.id === active.id && c.status === 'accepted');
          if (!current) { await finishLocally(await finalState(active), 'network'); return; }
          await connectMediaRef.current(current);
          setPhase('in_call');
          return;
        } catch (_) { /* still offline or LiveKit unreachable: retry */ }
      }
      if (!leavingRef.current) {
        await calls.declineCall(active.id).then(c => finishLocally(c, 'network')).catch(() => finishLocally(null, 'network'));
      }
    } finally { rejoinRef.current = null; }
  }, [finishLocally]);
  const connectMediaRef = useRef(null);

  const connectMedia = useCallback(async (active) => {
    setPhase(prev => (prev === 'outgoing' ? 'outgoing' : 'connecting'));
    const [{ Room, RoomEvent, Track, DisconnectReason }, access] = await Promise.all([loadLiveKit(), calls.callToken(active.id)]);
    // Ended on purpose (hang-up, room closed by the server): no rejoin attempts.
    const finalReasons = [DisconnectReason.CLIENT_INITIATED, DisconnectReason.ROOM_DELETED, DisconnectReason.PARTICIPANT_REMOVED,
      DisconnectReason.DUPLICATE_IDENTITY, DisconnectReason.ROOM_CLOSED].filter(r => r !== undefined);
    const lkRoom = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: true });
    lkRoom
      .on(RoomEvent.ParticipantConnected, () => setRemoteJoined(true))
      .on(RoomEvent.ParticipantDisconnected, () => setRemoteJoined(false))
      .on(RoomEvent.Reconnecting, () => setPhase('reconnecting'))
      .on(RoomEvent.Reconnected, () => setPhase('in_call'))
      .on(RoomEvent.Disconnected, reason => {
        if (leavingRef.current || roomRef.current !== lkRoom) return;
        if (finalReasons.includes(reason)) {
          calls.activeCalls().then(list => list.find(c => c.id === active.id)).catch(() => null)
            .then(async stillActive => (stillActive ? rejoin(active) : finishLocally(await finalState(active))));
          return;
        }
        rejoin(active);
      });
    roomRef.current = lkRoom;
    setRoom(lkRoom);
    await lkRoom.connect(access.url, access.token, { autoSubscribe: true });
    setRemoteJoined(lkRoom.remoteParticipants.size > 0);
    // Once joined, a publishing error never ends the call: a transport hiccup (the other
    // side dropping and rejoining) can reject a pending publish long after it started.
    // Only a refused microphone or camera permission is reported to the caller.
    const publish = async (enable) => {
      try { await enable(); return true; } catch (err) {
        if (err?.name === 'NotAllowedError') throw err;
        console.warn('[call] publish failed:', err?.name, err?.message);
        return false;
      }
    };
    const mic = await publish(() => lkRoom.localParticipant.setMicrophoneEnabled(true));
    const cam = active.call_type === 'video'
      && await publish(() => lkRoom.localParticipant.setCameraEnabled(true, { facingMode: 'user' }));
    setMicOn(mic);
    setCamOn(cam);
    setFacing('user');
    if (active.status === 'accepted') setPhase('in_call');
    return Track;
  }, [finishLocally, rejoin]);
  connectMediaRef.current = connectMedia;

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

  // The call is answered and its room is connected or recovering.
  const inProgress = () => callRef.current?.status === 'accepted'
    && ['connected', 'reconnecting', 'signalReconnecting'].includes(roomRef.current?.state);

  const start = useCallback(async (conversationId, callType) => {
    if (callRef.current) return;
    setError(null);
    leavingRef.current = false;
    endingRef.current = false;
    try {
      const created = await calls.startCall(conversationId, callType);
      setCall(created);
      setPhase('outgoing');
      await connectMedia(created);
    } catch (err) {
      // The call already ended (declined, cancelled): keep that outcome on screen.
      if (endingRef.current) return;
      // Technical detail for support; never includes tokens or media.
      console.warn('[call] start failed:', err?.name, err?.message, roomRef.current?.state);
      // A late connection error while the room is still up (the other side dropped and
      // is rejoining) is not a failed call: LiveKit and rejoin() handle the recovery.
      if (inProgress()) return;
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
    endingRef.current = false;
    try {
      const accepted = await calls.acceptCall(current.id);
      setCall(accepted);
      await connectMedia(accepted);
      setPhase('in_call');
    } catch (err) {
      if (endingRef.current) return;
      console.warn('[call] accept failed:', err?.name, err?.message, roomRef.current?.state);
      if (inProgress()) return;
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
