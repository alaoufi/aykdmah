import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomEvent, Track } from 'livekit-client';
import { useCall } from '../../context/CallContext';
import { reportCall } from '../../services/callService';
import Avatar from '../common/Avatar';

function useDuration(answeredAt, running) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running || !answeredAt) { setSeconds(0); return undefined; }
    const start = new Date(answeredAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [answeredAt, running]);
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Attaches the current local/remote tracks of the room to the given elements.
function useMediaElements(room, { remoteVideo, localVideo, remoteAudio }) {
  useEffect(() => {
    if (!room) return undefined;
    const sync = () => {
      const remote = [...room.remoteParticipants.values()][0];
      const remoteCam = remote?.getTrackPublication(Track.Source.Camera)?.videoTrack;
      const remoteMic = remote?.getTrackPublication(Track.Source.Microphone)?.audioTrack;
      const localCam = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (remoteVideo.current) { if (remoteCam) remoteCam.attach(remoteVideo.current); else remoteVideo.current.srcObject = null; }
      if (remoteAudio.current && remoteMic) remoteMic.attach(remoteAudio.current);
      if (localVideo.current) { if (localCam) localCam.attach(localVideo.current); else localVideo.current.srcObject = null; }
    };
    const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ParticipantConnected];
    events.forEach(e => room.on(e, sync));
    sync();
    return () => events.forEach(e => room.off(e, sync));
  }, [room, remoteVideo, localVideo, remoteAudio]);
}

// A phone handset: green to answer, red (turned down) to hang up or decline.
function Handset({ down }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true" style={down ? { transform: 'rotate(135deg)' } : undefined}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" />
    </svg>
  );
}

function RoundButton({ onClick, label, tone = 'neutral', children, disabled }) {
  const tones = {
    neutral: 'bg-white/15 text-white hover:bg-white/25',
    off: 'bg-white text-slate-900',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    accept: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`${tone === 'danger' || tone === 'accept' ? 'w-16 h-16' : 'w-14 h-14'} rounded-full grid place-items-center text-xl shadow-lift disabled:opacity-50 ${tones[tone]}`}>
      {children}
    </button>
  );
}

export default function CallOverlay() {
  const { t } = useTranslation();
  const { call, phase, error, room, micOn, camOn, remoteJoined, remoteVideo: hasRemoteVideo, audioBlocked, enableAudio, network, speaking, outputs, nextOutput, accept, hangup, toggleMic, toggleCam, switchCamera } = useCall();
  const remoteVideo = useRef(null);
  const localVideo = useRef(null);
  const remoteAudio = useRef(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [outputHint, setOutputHint] = useState(false);
  useEffect(() => { if (!outputHint) return undefined; const timer = setTimeout(() => setOutputHint(false), 6000); return () => clearTimeout(timer); }, [outputHint]);
  const live = phase === 'in_call' || phase === 'reconnecting';
  const duration = useDuration(call?.answered_at, live);
  useMediaElements(room, { remoteVideo, localVideo, remoteAudio });

  if (!call) return null;
  const video = call.call_type === 'video';
  const peerName = call.peer?.full_name || '';
  const statusText = {
    incoming: t(video ? 'calls.incoming_video' : 'calls.incoming_audio'),
    outgoing: t('calls.ringing'),
    connecting: t('calls.connecting'),
    reconnecting: t('calls.reconnecting'),
    in_call: remoteJoined ? duration : t('calls.waiting_peer'),
    ended: t(`calls.outcome.${call.status}`, { defaultValue: t('calls.outcome.ended') }),
  }[phase] || '';

  const submitReport = async () => {
    const reason = window.prompt(t('calls.report_prompt'));
    if (!reason || reason.trim().length < 3 || !call.id) return;
    setReporting(true);
    try { await reportCall(call.id, reason.trim()); setReported(true); } catch (_) { /* shown as not reported */ }
    finally { setReporting(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('calls.title')}
      className="fixed inset-0 z-[3000] bg-slate-950 text-white flex flex-col" style={{ height: '100dvh' }}>
      <audio ref={remoteAudio} autoPlay playsInline />
      <div className="relative flex-1 overflow-hidden">
        {video && live && (
          <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover bg-black" />
        )}
        {(!video || !live || !remoteJoined) && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center space-y-3 px-6">
              <div className="mx-auto w-fit"><Avatar src={call.peer?.avatar} name={peerName} size="lg" /></div>
              <div className="text-2xl font-extrabold">{peerName}</div>
              <div className="text-white/80" aria-live="polite">{statusText}</div>
              {phase === 'outgoing' && call.callee_reachable === false && (
                <div className="text-amber-300 text-sm max-w-xs mx-auto" data-testid="callee-unreachable">⚠️ {t('calls.callee_unreachable')}</div>
              )}
              {error && <div className="text-amber-300 text-sm">{t(`calls.errors.${error}`, { defaultValue: t('calls.errors.call_failed') })}</div>}
            </div>
          </div>
        )}
        {video && live && remoteJoined && (
          <div className="absolute top-4 inset-x-0 text-center text-sm text-white drop-shadow">{peerName} · {statusText}</div>
        )}
        {/* Why there is no picture (AYK-066): the other side's camera is off or blocked, or mine failed. */}
        {video && live && remoteJoined && !hasRemoteVideo && (
          <div className="absolute top-1/2 inset-x-6 mx-auto max-w-sm px-3 py-2 rounded-card bg-black/70 text-white text-[13px] text-center" role="status" data-testid="no-remote-video">
            📷 {t('calls.remote_camera_off', { name: peerName })}
          </div>
        )}
        {video && live && !camOn && (
          <div className="absolute bottom-24 inset-x-6 mx-auto max-w-sm px-3 py-2 rounded-card bg-amber-500/90 text-black text-[13px] font-semibold text-center" role="status" data-testid="my-camera-off">
            📷 {t('calls.my_camera_off')}
          </div>
        )}
        {video && live && camOn && (
          <video ref={localVideo} autoPlay playsInline muted
            className="absolute bottom-4 end-4 w-28 h-40 sm:w-40 sm:h-56 object-cover rounded-card border border-white/30 bg-black" style={{ transform: 'scaleX(-1)' }} />
        )}
        {/* Indicators live inside the picture area so they never cover the buttons (AYK-066). */}
        {/* Internet quality during the call (AYK-059): a warning when either side's connection is weak. */}
        {live && ['poor', 'lost'].includes(network?.mine) && (
          <div className="absolute z-10 top-3 inset-x-3 mx-auto max-w-sm px-3 py-2 rounded-card bg-red-600/90 text-white text-[13px] font-bold text-center" role="status" data-testid="network-mine">
            📶 {t('calls.network_mine_weak')}
          </div>
        )}
        {live && !['poor', 'lost'].includes(network?.mine) && ['poor', 'lost'].includes(network?.theirs) && (
          <div className="absolute z-10 top-3 inset-x-3 mx-auto max-w-sm px-3 py-2 rounded-card bg-amber-500/90 text-black text-[13px] font-bold text-center" role="status" data-testid="network-theirs">
            📶 {t('calls.network_theirs_weak')}
          </div>
        )}
        {/* Live talk indicators: my microphone is sending, their voice is arriving. */}
        {live && remoteJoined && (
          <div className={`absolute z-10 ${video && camOn ? 'bottom-48 sm:bottom-64' : 'bottom-3'} end-3 flex flex-col items-end gap-1 text-[12px]`} data-testid="talk-indicators">
            <span className={`px-2 py-1 rounded-pill transition ${speaking?.theirs ? 'bg-emerald-600 text-white scale-105' : 'bg-black/50 text-white/70'}`}>
              🔊 {t(speaking?.theirs ? 'calls.they_talking' : 'calls.they_quiet')}
            </span>
            <span className={`px-2 py-1 rounded-pill transition ${speaking?.mine ? 'bg-emerald-600 text-white scale-105' : 'bg-black/50 text-white/70'}`}>
              🎙️ {t(!micOn ? 'calls.mic_muted' : speaking?.mine ? 'calls.mine_sending' : 'calls.mine_quiet')}
            </span>
          </div>
        )}
        {live && network?.mine && network.mine !== 'unknown' && (
          <div className="absolute z-10 bottom-3 start-3 px-2 py-1 rounded-pill bg-black/50 text-[12px]" data-testid="network-chip">
            {{ excellent: '🟢', good: '🟡', poor: '🔴', lost: '⚫' }[network.mine]} {t(`calls.network_${network.mine}`)}
          </div>
        )}
        {outputHint && (
          <div className="absolute z-10 top-16 inset-x-3 mx-auto max-w-sm px-3 py-2 rounded-card bg-black/80 text-white text-[13px] text-center" role="status" data-testid="output-hint">
            🎧 {t('calls.audio_output_hint')}
          </div>
        )}
        {live && audioBlocked && (
          <button type="button" onClick={enableAudio} data-testid="enable-audio"
            className="absolute z-10 top-1/3 inset-x-6 mx-auto max-w-sm py-4 rounded-card bg-emerald-600 text-white text-lg font-extrabold shadow-lift">
            🔊 {t('calls.tap_for_audio')}
          </button>
        )}
      </div>

      <div className="p-5 pb-8 flex items-center justify-center gap-4 flex-wrap bg-slate-900/80">
        {phase === 'incoming' && (
          <>
            <RoundButton tone="danger" onClick={hangup} label={t('calls.decline')}><Handset down /></RoundButton>
            <RoundButton tone="accept" onClick={accept} label={t('calls.accept')}><Handset /></RoundButton>
          </>
        )}
        {['outgoing', 'connecting', 'in_call', 'reconnecting'].includes(phase) && (
          <>
            <RoundButton tone={micOn ? 'neutral' : 'off'} onClick={toggleMic} disabled={!room}
              label={micOn ? t('calls.mute') : t('calls.unmute')}>{micOn ? '🎙️' : '🔇'}</RoundButton>
            {/* Speaker / earpiece or headset (AYK-060). Phones switch to a plugged-in or Bluetooth
                headset on their own; where the browser lists several outputs, this button cycles them. */}
            <RoundButton onClick={async () => { if (!(await nextOutput())) setOutputHint(true); }} disabled={!room}
              label={t('calls.audio_output')}>{outputs.length > 1 ? '🔈' : '🔊'}</RoundButton>
            {video && (
              <>
                <RoundButton tone={camOn ? 'neutral' : 'off'} onClick={toggleCam} disabled={!room}
                  label={camOn ? t('calls.camera_off') : t('calls.camera_on')}>{camOn ? '📷' : '🚫'}</RoundButton>
                <RoundButton onClick={switchCamera} disabled={!room || !camOn} label={t('calls.switch_camera')}>🔄</RoundButton>
              </>
            )}
            <RoundButton tone="danger" onClick={hangup} label={t('calls.hangup')}><Handset down /></RoundButton>
          </>
        )}
        {phase === 'ended' && call.id && call.answered_at && (
          <button type="button" onClick={submitReport} disabled={reporting || reported}
            className="px-4 py-2 rounded-pill bg-white/10 text-sm disabled:opacity-60">
            {reported ? t('calls.reported') : t('calls.report')}
          </button>
        )}
      </div>
    </div>
  );
}
