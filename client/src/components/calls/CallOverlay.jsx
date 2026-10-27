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

function RoundButton({ onClick, label, tone = 'neutral', children, disabled }) {
  const tones = {
    neutral: 'bg-white/15 text-white hover:bg-white/25',
    off: 'bg-white text-slate-900',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    accept: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`w-14 h-14 rounded-full grid place-items-center text-xl shadow-lift disabled:opacity-50 ${tones[tone]}`}>
      {children}
    </button>
  );
}

export default function CallOverlay() {
  const { t } = useTranslation();
  const { call, phase, error, room, micOn, camOn, remoteJoined, accept, hangup, toggleMic, toggleCam, switchCamera } = useCall();
  const remoteVideo = useRef(null);
  const localVideo = useRef(null);
  const remoteAudio = useRef(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
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
      <audio ref={remoteAudio} autoPlay />
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
              {error && <div className="text-amber-300 text-sm">{t(`calls.errors.${error}`, { defaultValue: t('calls.errors.call_failed') })}</div>}
            </div>
          </div>
        )}
        {video && live && remoteJoined && (
          <div className="absolute top-4 inset-x-0 text-center text-sm text-white drop-shadow">{peerName} · {statusText}</div>
        )}
        {video && live && camOn && (
          <video ref={localVideo} autoPlay playsInline muted
            className="absolute bottom-4 end-4 w-28 h-40 sm:w-40 sm:h-56 object-cover rounded-card border border-white/30 bg-black" style={{ transform: 'scaleX(-1)' }} />
        )}
      </div>

      <div className="p-5 pb-8 flex items-center justify-center gap-4 flex-wrap bg-slate-900/80">
        {phase === 'incoming' && (
          <>
            <RoundButton tone="danger" onClick={hangup} label={t('calls.decline')}>✕</RoundButton>
            <RoundButton tone="accept" onClick={accept} label={t('calls.accept')}>{video ? '🎥' : '📞'}</RoundButton>
          </>
        )}
        {['outgoing', 'connecting', 'in_call', 'reconnecting'].includes(phase) && (
          <>
            <RoundButton tone={micOn ? 'neutral' : 'off'} onClick={toggleMic} disabled={!room}
              label={micOn ? t('calls.mute') : t('calls.unmute')}>{micOn ? '🎙️' : '🔇'}</RoundButton>
            {video && (
              <>
                <RoundButton tone={camOn ? 'neutral' : 'off'} onClick={toggleCam} disabled={!room}
                  label={camOn ? t('calls.camera_off') : t('calls.camera_on')}>{camOn ? '📷' : '🚫'}</RoundButton>
                <RoundButton onClick={switchCamera} disabled={!room || !camOn} label={t('calls.switch_camera')}>🔄</RoundButton>
              </>
            )}
            <RoundButton tone="danger" onClick={hangup} label={t('calls.hangup')}>⏹</RoundButton>
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
