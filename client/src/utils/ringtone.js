// Call tones generated with Web Audio (no sound files to download).
// 'incoming': a loud double ring repeated every 3 s; 'outgoing': a soft ringback tone.
let ctx = null;
let timer = null;
let nodes = [];

const PATTERNS = {
  incoming: { freqs: [660, 880], gain: 0.25, bursts: [[0, 0.4], [0.6, 0.4]], every: 3000 },
  outgoing: { freqs: [425], gain: 0.08, bursts: [[0, 1.0]], every: 4000 },
};

function beep(pattern) {
  const now = ctx.currentTime;
  for (const [start, length] of pattern.bursts) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(pattern.gain, now + start + 0.02);
    gain.gain.setValueAtTime(pattern.gain, now + start + length - 0.05);
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
