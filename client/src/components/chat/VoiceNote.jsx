import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const BARS = 28;
const clock = s => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

// A stable pseudo-waveform per message, so each voice note looks distinct like WhatsApp.
function bars(seed) {
  let x = 0;
  for (const c of String(seed)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, () => { x = (x * 1103515245 + 12345) >>> 0; return 25 + (x % 75); });
}

// WhatsApp-style voice message: play/pause, waveform progress (tap to seek), duration.
export default function VoiceNote({ src, seed, knownDuration, fallbackName }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(Number(knownDuration) || 0);
  const [speed, setSpeed] = useState(1);
  const heights = useRef(bars(seed || src)).current;

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return undefined;
    const onMeta = () => {
      // Recorded WebM reports Infinity until read through; seeking far ahead reveals it.
      if (!Number.isFinite(audio.duration)) {
        const fix = () => { audio.removeEventListener('timeupdate', fix); setDuration(audio.duration); audio.currentTime = 0; };
        audio.addEventListener('timeupdate', fix);
        audio.currentTime = 1e7;
      } else setDuration(audio.duration);
    };
    const onTime = () => setTime(audio.currentTime);
    const onEnd = () => { setPlaying(false); setTime(0); };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, []);

  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) {
      // Only one voice note plays at a time.
      document.querySelectorAll('audio.voice-note-audio').forEach(other => { if (other !== audio) other.pause(); });
      audio.play().catch(() => {});
    } else audio.pause();
  };
  const seek = (event) => {
    const audio = ref.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const ratio = Math.min(1, Math.max(0, (rtl ? rect.right - event.clientX : event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setTime(audio.currentTime);
  };
  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };
  const progress = duration > 0 ? time / duration : 0;

  return (
    <div className="voice-note" dir="ltr">
      <button type="button" className="voice-note-play" onClick={toggle} aria-label={t(playing ? 'chat.pause' : 'chat.play')}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="voice-note-body">
        <div className="voice-note-wave" onClick={seek} role="slider" aria-label={t('chat.voice_message')}
          aria-valuemin={0} aria-valuemax={Math.round(duration) || 0} aria-valuenow={Math.round(time)} tabIndex={0}
          onKeyDown={e => { if (ref.current && ['ArrowRight', 'ArrowLeft'].includes(e.key)) ref.current.currentTime += e.key === 'ArrowRight' ? 3 : -3; }}>
          {heights.map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} className={i / BARS < progress ? 'played' : ''} />
          ))}
        </div>
        <div className="voice-note-meta">
          <span>{clock(playing || time > 0 ? time : duration)}</span>
          {playing && <button type="button" className="voice-note-speed" onClick={cycleSpeed}>{speed}×</button>}
        </div>
      </div>
      <span className="voice-note-mic" aria-hidden="true">🎙️</span>
      <audio ref={ref} className="voice-player voice-note-audio" preload="metadata" src={src} aria-label={t('chat.voice_message')}>
        {t('chat.audio_unavailable')} <a href={src} target="_blank" rel="noopener noreferrer">{fallbackName || t('chat.attachment')}</a>
      </audio>
    </div>
  );
}
