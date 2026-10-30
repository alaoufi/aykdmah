// Call tones generated with Web Audio (no sound files to download).
// 'incoming': a loud double ring repeated every 3 s; 'outgoing': a soft ringback tone.
let ctx = null;
let timer = null;
let nodes = [];

const PATTERNS = {
  // Louder and longer so it is a phone ring, not a message tone (AYK-086).
  incoming: { freqs: [660, 880], gain: 0.5, bursts: [[0, 0.5], [0.7, 0.5]], every: 2500 },
  // The caller's ringback, like a phone line: a clear double-tone ring every 3 s (AYK-086; was one
  // soft 425 Hz beep every 4 s, heard as a message tone).
  outgoing: { freqs: [425, 480], gain: 0.5, bursts: [[0, 1.2]], every: 3000 },
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
  // 80 keeps the designed loudness; 100 is 25% louder, 0 is silent. A call's ring never goes
  // below 50, so a muted message tone cannot silence calls (AYK-092).
  const volume = pattern === PATTERNS.incoming ? Math.max(50, getToneVolume()) : getToneVolume();
  const level = (pattern.gain * volume) / 80;
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

// Called in the tap itself (call / answer): browsers allow sound to start only from a tap, and
// on a slow network the ringback would otherwise begin seconds later, outside it (AYK-083).
export function primeAudio() {
  const AudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioContext) return;
  try { ctx ||= new AudioContext(); ctx.resume?.().catch(() => {}); } catch (_) { /* no audio output */ }
}

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

// Is sound actually playing? Browsers keep it suspended until the page has had a tap (AYK-092).
export const toneAudible = () => Boolean(ctx && ctx.state === 'running');

export function stopTone() {
  clearInterval(timer);
  timer = null;
  for (const osc of nodes) { try { osc.stop(); } catch (_) { /* already stopped */ } }
  nodes = [];
}
