// Call tones generated with Web Audio (no sound files to download).
// 'incoming': a loud double ring repeated every 3 s; 'outgoing': a soft ringback tone.
let ctx = null;
let timer = null;
let nodes = [];

const PATTERNS = {
  incoming: { freqs: [660, 880], gain: 0.25, bursts: [[0, 0.4], [0.6, 0.4]], every: 3000 },
  outgoing: { freqs: [425], gain: 0.08, bursts: [[0, 1.0]], every: 4000 },
};

// The user's tone volume (0–100, default 80), kept on this device (AYK-057).
const VOLUME_KEY = 'ayk_tone_volume';
export function getToneVolume() {
  try { const v = Number(localStorage.getItem(VOLUME_KEY)); return localStorage.getItem(VOLUME_KEY) === null || !Number.isFinite(v) ? 80 : Math.min(100, Math.max(0, v)); }
  catch (_) { return 80; }
}
export function setToneVolume(value) {
  try { localStorage.setItem(VOLUME_KEY, String(Math.min(100, Math.max(0, Math.round(Number(value) || 0))))); } catch (_) { /* private mode */ }
}

function beep(pattern) {
  const now = ctx.currentTime;
  // 80 keeps the designed loudness; 100 is 25% louder, 0 is silent.
  const level = (pattern.gain * getToneVolume()) / 80;
  for (const [start, length] of pattern.bursts) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(level, now + start + 0.02);
    gain.gain.setValueAtTime(level, now + start + length - 0.05);
    gain.gain.linearRampToValueAtTime(0, now + start + length);
    gain.connect(ctx.destination);
    for (const freq of pattern.freqs) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + start);
      osc.stop(now + start + length);
      nodes.push(osc);
    }
  }
}

// The site's own message tone (AYK-052): three rising notes, loud enough to notice. The same
// tone plays for the receiver (new message) and for the sender (message sent).
export function chime() {
  const AudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioContext || timer) return; // a call is ringing: its tone is enough
  try {
    ctx ||= new AudioContext();
    ctx.resume?.().catch(() => {});
    if (getToneVolume() === 0) return;
    beep({ freqs: [784], gain: 0.35, bursts: [[0, 0.11]] });
    beep({ freqs: [1047], gain: 0.35, bursts: [[0.13, 0.11]] });
    beep({ freqs: [1568], gain: 0.35, bursts: [[0.26, 0.22]] });
    navigator.vibrate?.([120, 60, 120]);
  } catch (_) { /* no audio output */ }
}

// The sender hears the same tone as the receiver (owner: "the sound they hear, I hear").
export const sentTone = () => chime();

export function startTone(kind) {
  stopTone();
  const pattern = PATTERNS[kind];
  const AudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!pattern || !AudioContext) return;
  try {
    ctx ||= new AudioContext();
    // Browsers keep audio suspended until the page has had a tap; then it resumes here.
    ctx.resume?.().catch(() => {});
    beep(pattern);
    timer = setInterval(() => { nodes = []; beep(pattern); }, pattern.every);
  } catch (_) { /* no audio output: the call screen and vibration still show */ }
}

export function stopTone() {
  clearInterval(timer);
  timer = null;
  for (const osc of nodes) { try { osc.stop(); } catch (_) { /* already stopped */ } }
  nodes = [];
}
