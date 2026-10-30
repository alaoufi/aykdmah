import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import * as calls from '../services/callService';
import { syncPush } from '../services/pushService';
import { sendDeviceReport } from '../utils/deviceReport';
import { startTone, stopTone, primeAudio } from '../utils/ringtone';
import { collectCallStats } from '../utils/callStats';

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
  // The other side's camera picture is arriving (AYK-066).
  const [remoteVideo, setRemoteVideo] = useState(false);
  // The browser refused to play the other side's audio until a tap (Chrome on Android).
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [network, setNetwork] = useState({ mine: 'unknown', theirs: 'unknown' });
  // Who is talking right now, from the audio actually flowing through the call server.
  const [speaking, setSpeaking] = useState({ mine: false, theirs: false });
  // For the quality log (AYK-060): seconds of weak internet, reconnects, a blocked-audio moment.
  const qualityLog = useRef({ poorSince: 0, poorMs: 0, reconnects: 0, audioBlocked: false });
  const statsTimerRef = useRef(null);
  // Audio output (speaker / earpiece or headset) where the browser lets a page choose it.
  const [outputs, setOutputs] = useState([]);
  const [outputId, setOutputId] = useState('');
  const roomRef = useRef(null);
  const callRef = useRef(null);
  const leavingRef = useRef(false);
  callRef.current = call;

  const teardown = useCallback(async () => {
    const current = roomRef.current;
    // Report how the connection behaved before closing it (answered calls only).
    const ended = callRef.current;
    if (current && ended?.id && ended.answered_at) {
      const log = qualityLog.current;
      const poorMs = log.poorMs + (log.poorSince ? Date.now() - log.poorSince : 0);
      // Read the statistics now (at most 1.5 s); if the connection is already gone, use the last
      // snapshot taken during the call (every 10 s), so the log is never just zeros (AYK-066).
      const fresh = await Promise.race([collectCallStats(current).catch(() => ({})), new Promise(resolve => setTimeout(() => resolve({}), 1500))]);
      const stats = (fresh.audio_kb_in || fresh.audio_kb_out) ? fresh : (log.lastStats || fresh);
      calls.sendCallDiagnostics(ended.id, {
        ...stats, poor_seconds: Math.round(poorMs / 1000), reconnects: log.reconnects, audio_blocked: log.audioBlocked,
      }).catch(() => {});
    }
    qualityLog.current = { poorSince: 0, poorMs: 0, reconnects: 0, audioBlocked: false };
    roomRef.current = null;
    setRoom(null);
    setRemoteJoined(false);
    setRemoteVideo(false);
    clearInterval(statsTimerRef.current);
    setAudioBlocked(false);
    setNetwork({ mine: 'unknown', theirs: 'unknown' });
    setSpeaking({ mine: false, theirs: false });
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
    const [{ Room, RoomEvent, Track, DisconnectReason, VideoPresets, ConnectionQuality }, access] = await Promise.all([loadLiveKit(), calls.callToken(active.id)]);
    // Ended on purpose (hang-up, room closed by the server): no rejoin attempts.
    const finalReasons = [DisconnectReason.CLIENT_INITIATED, DisconnectReason.ROOM_DELETED, DisconnectReason.PARTICIPANT_REMOVED,
      DisconnectReason.DUPLICATE_IDENTITY, DisconnectReason.ROOM_CLOSED].filter(r => r !== undefined);
    // Video captured at 540p, up to 1.2 Mbps and 30 fps, sent in layers (simulcast): a strong
    // network gets the sharp layer, a weak one a lighter layer instead of a frozen picture (AYK-059).
    const lkRoom = new Room({
      adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: true,
      videoCaptureDefaults: VideoPresets?.h540 ? { resolution: VideoPresets.h540.resolution } : undefined,
      publishDefaults: {
        simulcast: true,
        videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
        videoSimulcastLayers: VideoPresets ? [VideoPresets.h180, VideoPresets.h360].filter(Boolean) : undefined,
      },
    });
    // Is the other side's camera picture arriving? (AYK-066)
    const syncRemoteVideo = () => setRemoteVideo([...lkRoom.remoteParticipants.values()].some(p =>
      [...p.trackPublications.values()].some(pub => pub.kind === 'video' && pub.isSubscribed && !pub.isMuted)));
    lkRoom
      .on(RoomEvent.TrackSubscribed, syncRemoteVideo).on(RoomEvent.TrackUnsubscribed, syncRemoteVideo)
      .on(RoomEvent.TrackMuted, syncRemoteVideo).on(RoomEvent.TrackUnmuted, syncRemoteVideo)
      .on(RoomEvent.ParticipantConnected, () => setRemoteJoined(true))
      .on(RoomEvent.ParticipantDisconnected, () => setRemoteJoined(false))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!lkRoom.canPlaybackAudio);
    // A quality snapshot every 10 s, kept for the end-of-call log (AYK-066).
    clearInterval(statsTimerRef.current);
    statsTimerRef.current = setInterval(() => {
      if (roomRef.current !== lkRoom) { clearInterval(statsTimerRef.current); return; }
      collectCallStats(lkRoom).then(stats => { if (stats.audio_kb_in || stats.audio_kb_out) qualityLog.current.lastStats = stats; }).catch(() => {});
    }, 10000);
    navigator.mediaDevices?.enumerateDevices?.().then(list => {
      const outs = list.filter(d => d.kind === 'audiooutput' && d.deviceId);
      setOutputs(outs.map(d => ({ id: d.deviceId, label: d.label })));
      setOutputId(lkRoom.getActiveDevice?.('audiooutput') || 'default');
    }).catch(() => {});
        if (!lkRoom.canPlaybackAudio) qualityLog.current.audioBlocked = true;
      })
      .on(RoomEvent.ActiveSpeakersChanged, speakers => setSpeaking({
        mine: speakers.some(p => p.isLocal), theirs: speakers.some(p => !p.isLocal),
      }))
      // Internet quality for me and for the other side: excellent / good / poor / lost.
      .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        const level = quality === ConnectionQuality?.Excellent ? 'excellent' : quality === ConnectionQuality?.Good ? 'good'
          : quality === ConnectionQuality?.Poor ? 'poor' : quality === ConnectionQuality?.Lost ? 'lost' : 'unknown';
        setNetwork(previous => ({ ...previous, [participant?.isLocal ? 'mine' : 'theirs']: level }));
        if (participant?.isLocal) {
          const log = qualityLog.current; const weak = level === 'poor' || level === 'lost';
          if (weak && !log.poorSince) log.poorSince = Date.now();
          if (!weak && log.poorSince) { log.poorMs += Date.now() - log.poorSince; log.poorSince = 0; }
        }
      })
      .on(RoomEvent.Reconnecting, () => { qualityLog.current.reconnects += 1; setPhase('reconnecting'); })
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
    // Still inside the tap that started or answered the call: unlock audio playback now.
    await lkRoom.startAudio().catch(() => {});
    setAudioBlocked(!lkRoom.canPlaybackAudio);
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
    const [mic, cam] = await Promise.all([
      publish(() => lkRoom.localParticipant.setMicrophoneEnabled(true)),
      active.call_type === 'video' ? publish(() => lkRoom.localParticipant.setCameraEnabled(true, { facingMode: 'user' })) : false,
    ]);
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
      // Load the call engine while it rings, so answering connects at once.
      loadLiveKit().catch(() => {});
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
    // While a call rings, check every 4 s even if the socket looks connected: on a weak network
    // it can be silently dead and the end of the call would never arrive (AYK-083).
    timer = setInterval(poll, ['outgoing', 'incoming'].includes(phase) ? 4000 : connected ? 20000 : 5000);
    return () => {
      socket?.off('call:incoming', onIncoming);
      socket?.off('call:state', onState);
      clearInterval(timer);
    };
  }, [user, socketRef, connected, applyState, finishLocally, phase]);

  // "📞 Answer" tapped in the call notification opens /chat/:id?answer=<call id> (AYK-059).
  const autoAnswerRef = useRef((() => { try { return Number(new URLSearchParams(window.location.search).get('answer')) || 0; } catch (_) { return 0; } })());
  useEffect(() => {
    if (!autoAnswerRef.current || phase !== 'incoming' || call?.id !== autoAnswerRef.current) return;
    autoAnswerRef.current = 0;
    try { const url = new URL(window.location.href); url.searchParams.delete('answer'); window.history.replaceState(null, '', url); } catch (_) { /* keep the URL */ }
    acceptRef.current?.();
  }, [phase, call?.id]);
  const acceptRef = useRef(null);

  // Release devices if the user signs out mid-call.
  useEffect(() => { if (!user) { teardown(); setCall(null); setPhase('idle'); } }, [user, teardown]);

  // A device that already allowed notifications rings for whoever is signed in on it.
  // Then this device reports its system and capabilities for the devices log (AYK-062).
  useEffect(() => { if (user?.id) syncPush().catch(() => {}).finally(() => sendDeviceReport().catch(() => {})); }, [user?.id]);

  // Last resort (AYK-083): the server ends an unanswered call after 45 s; if that never arrives,
  // the caller's "Calling…" screen closes on its own at 50 s instead of hanging.
  useEffect(() => {
    if (phase !== 'outgoing') return undefined;
    const id = callRef.current?.id;
    const stuck = setTimeout(() => {
      const current = callRef.current;
      if (current && current.id === id && current.status === 'ringing') finishLocally({ ...current, status: 'missed', end_reason: 'no_answer' });
    }, 50000);
    return () => clearTimeout(stuck);
  }, [phase, finishLocally]);

  // Ringing tone for an incoming call, ringback while the other side has not answered.
  useEffect(() => {
    if (phase === 'incoming') startTone('incoming');
    else if (phase === 'outgoing') startTone('outgoing');
    else stopTone();
    return stopTone;
  }, [phase]);

  // Keep vibrating while it rings (phones), not just once.
  useEffect(() => {
    if (phase !== 'incoming' || !navigator.vibrate) return undefined;
    const buzz = setInterval(() => navigator.vibrate([400, 200, 400]), 3000);
    return () => { clearInterval(buzz); navigator.vibrate(0); };
  }, [phase]);

  // The call is answered and its room is connected or recovering.
  const inProgress = () => callRef.current?.status === 'accepted'
    && ['connected', 'reconnecting', 'signalReconnecting'].includes(roomRef.current?.state);

  const start = useCallback(async (conversationId, callType) => {
    if (callRef.current) return;
    primeAudio();
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
    primeAudio();
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

  acceptRef.current = accept;

  const hangup = useCallback(async () => {
    const current = callRef.current;
    leavingRef.current = true;
    if (!current?.id) { await finishLocally(null); return; }
    try { await finishLocally(await calls.declineCall(current.id)); }
    catch (_) { await finishLocally({ ...current, status: 'ended' }); }
  }, [finishLocally]);

  // Next audio output (speaker → earpiece/headset → …), where the browser offers more than one.
  const nextOutput = useCallback(async () => {
    const lk = roomRef.current; if (!lk || outputs.length < 2) return false;
    const index = outputs.findIndex(o => o.id === outputId);
    const next = outputs[(index + 1) % outputs.length];
    try { await lk.switchActiveDevice('audiooutput', next.id); setOutputId(next.id); return true; } catch (_) { return false; }
  }, [outputs, outputId]);

  const enableAudio = useCallback(async () => {
    const lk = roomRef.current; if (!lk) return;
    try { await lk.startAudio(); } catch (_) { /* still blocked: the button stays */ }
    // Replay any remote audio element that was refused before the tap.
    document.querySelectorAll('[role="dialog"] audio').forEach(el => el.play?.().catch(() => {}));
    setAudioBlocked(!lk.canPlaybackAudio);
  }, []);

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

  const value = { call, phase, error, room, micOn, camOn, facing, remoteJoined, audioBlocked, enableAudio, network, speaking, remoteVideo, outputs, outputId, nextOutput, start, accept, hangup, toggleMic, toggleCam, switchCamera };
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
