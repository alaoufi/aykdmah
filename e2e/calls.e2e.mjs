// Real two-browser call test: a client and a provider in separate Chromium contexts
// with fake camera/microphone devices, connected through the live LiveKit server.
// Run via deploy/e2e-calls.sh, which prepares an isolated staging app and database.
import { chromium } from 'playwright';

const { BASE, CONV, CLIENT, PROVIDER, OUTSIDER } = process.env;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

// The full Chromium build: its headless shell no longer honours the insecure-origin
// flag, which leaves navigator.mediaDevices undefined on the plain-HTTP staging app.
const browser = await chromium.launch({ channel: 'chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--unsafely-treat-insecure-origin-as-secure=${BASE}`],
});

async function party(token, label) {
  // bypassCSP: the staging app runs over plain HTTP; production CSP is verified separately.
  const context = await browser.newContext({ permissions: ['microphone', 'camera'], locale: 'ar-SA', bypassCSP: true, viewport: { width: 390, height: 844 } });
  await context.addInitScript(value => localStorage.setItem('lsm_token', value), token);
  await context.addInitScript(() => {
    window.cameraCaptureRequests = 0;
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) return;
    const capture = media.getUserMedia.bind(media);
    media.getUserMedia = constraints => {
      if (constraints?.video) window.cameraCaptureRequests += 1;
      return capture(constraints);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', err => console.log(`[${label} pageerror]`, err.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/favicon|manifest/.test(msg.text())) console.log(`[${label} console]`, msg.text().slice(0, 200)); });
  return { context, page };
}

const mediaState = page => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const audio = dialog?.querySelector('audio')?.srcObject?.getAudioTracks?.() || [];
  const videos = [...(dialog?.querySelectorAll('video') || [])];
  return {
    remoteAudioLive: audio.some(t => t.readyState === 'live'),
    videoSizes: videos.map(v => v.videoWidth),
  };
});
const inCall = page => page.locator('[role="dialog"]').getByText(/\d\d:\d\d/).first().waitFor({ timeout: 30000 });
const button = (page, name) => page.locator('[role="dialog"]').getByRole('button', { name, exact: true });

// AYK-167: a live track alone does not prove decoded sound. Sample the received
// synthetic microphone signal without recording it or altering the call's playback.
const decodedSound = page => page.evaluate(async () => {
  const stream = document.querySelector('[role="dialog"] audio')?.srcObject;
  if (!stream?.getAudioTracks().length) return { activeFrames: 0, peak: 0 };
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let activeFrames = 0, peak = 0;
  try {
    await context.resume();
    for (let frame = 0; frame < 100; frame += 1) {
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
      if (Math.sqrt(energy / samples.length) > 0.0001) activeFrames += 1;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return { activeFrames, peak: Number(peak.toFixed(5)) };
  } finally { source.disconnect(); await context.close(); }
});

const caller = await party(CLIENT, 'client');
const callee = await party(PROVIDER, 'provider');
await callee.page.goto(`${BASE}/`);
await caller.page.goto(`${BASE}/chat/${CONV}`);
await caller.page.getByRole('button', { name: 'اتصال صوتي' }).first().waitFor({ timeout: 30000 });

// 1) Voice call: ring, answer, audio flows both ways, mute, hang up.
await caller.page.getByRole('button', { name: 'اتصال صوتي' }).first().click();
await button(callee.page, 'رد').waitFor({ timeout: 20000 });
check('incoming voice call screen shown to the provider', true);
await button(callee.page, 'رد').click();
await Promise.all([inCall(caller.page), inCall(callee.page)]);
await caller.page.waitForTimeout(3000);
const voiceCaller = await mediaState(caller.page), voiceCallee = await mediaState(callee.page);
check('voice: client has a live remote audio track', voiceCaller.remoteAudioLive);
check('voice: provider has a live remote audio track', voiceCallee.remoteAudioLive);
for (const [label, party] of [['client', caller], ['provider', callee]]) {
  const sound = await decodedSound(party.page);
  check(`voice: ${label} receives non-silent decoded samples`, sound.activeFrames > 0, JSON.stringify(sound));
}
await button(caller.page, 'كتم الميكروفون').click();
check('voice: mute toggles', await button(caller.page, 'تشغيل الميكروفون').isVisible());
await button(callee.page, 'إنهاء المكالمة').click();
await caller.page.locator('[role="dialog"]').getByText('انتهت المكالمة').waitFor({ timeout: 15000 });
check('voice: hang-up by provider ends the call for the client', true);
await caller.page.waitForTimeout(3500);

// 2) Declined call.
await caller.page.getByRole('button', { name: 'اتصال صوتي' }).first().click();
await button(callee.page, 'رفض').waitFor({ timeout: 20000 });
await button(callee.page, 'رفض').click();
await caller.page.locator('[role="dialog"]').getByText('مرفوضة').waitFor({ timeout: 15000 });
check('declined call is reported to the caller', true);
await caller.page.waitForTimeout(3500);

// 3) Video call: both see each other, camera off, network drop and recovery, hang up.
await caller.page.getByRole('button', { name: 'اتصال فيديو' }).first().click();
await button(callee.page, 'رد').waitFor({ timeout: 20000 });
for (const [label, party] of [['client', caller], ['provider', callee]]) {
  check(`video: ${label} does not capture a camera while ringing`, await party.page.evaluate(() => window.cameraCaptureRequests) === 0);
}
await button(callee.page, 'رد').click();
await Promise.all([inCall(caller.page), inCall(callee.page)]);
for (const [label, party] of [['client', caller], ['provider', callee]]) {
  check(`video: ${label} joins with camera off and no camera capture`, await button(party.page, 'تشغيل الكاميرا').isVisible()
    && await party.page.evaluate(() => window.cameraCaptureRequests) === 0);
  await button(party.page, 'تشغيل الكاميرا').click();
}
await caller.page.waitForTimeout(4000);
const videoCaller = await mediaState(caller.page), videoCallee = await mediaState(callee.page);
check('video: client receives provider video', videoCaller.videoSizes[0] > 0, `sizes ${videoCaller.videoSizes}`);
check('video: provider receives client video', videoCallee.videoSizes[0] > 0, `sizes ${videoCallee.videoSizes}`);
await button(callee.page, 'إيقاف الكاميرا').click();
check('video: camera off toggles', await button(callee.page, 'تشغيل الكاميرا').isVisible());
const capturesBeforeReconnect = await callee.page.evaluate(() => window.cameraCaptureRequests);

// Outsider: knows the call id and asks for a token / tries to end it.
const active = await caller.page.evaluate(async () => (await (await fetch('/api/calls/active', { headers: { Authorization: `Bearer ${localStorage.getItem('lsm_token')}` } })).json()).data);
const callId = active[0]?.id;
for (const action of ['token', 'accept', 'decline']) {
  const res = await fetch(`${BASE}/api/calls/${callId}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${OUTSIDER}` } });
  check(`outsider ${action} refused`, res.status === 404, `HTTP ${res.status}`);
}

await callee.context.setOffline(true);
await callee.page.waitForTimeout(4000);
check('video: camera remains off after browser returns online', await button(callee.page, 'تشغيل الكاميرا').isVisible()
  && await callee.page.evaluate(() => window.cameraCaptureRequests) === capturesBeforeReconnect);
await callee.context.setOffline(false);
await inCall(callee.page);
await callee.page.waitForTimeout(4000);
const afterDrop = await mediaState(caller.page);
// Playwright offline mode tests browser connectivity events; it does not prove
// that UDP media packets were dropped. Do not label this a packet-loss test.
check('video: remote track remains live after a 4 s browser offline toggle', afterDrop.remoteAudioLive, `sizes ${afterDrop.videoSizes}`);
for (const [label, party] of [['client', caller], ['provider', callee]]) {
  const sound = await decodedSound(party.page);
  check(`video: ${label} receives decoded audio after browser returns online`, sound.activeFrames > 0, JSON.stringify(sound));
}
await button(caller.page, 'إنهاء المكالمة').click();
await callee.page.locator('[role="dialog"]').getByText('انتهت المكالمة').waitFor({ timeout: 15000 });
check('video: hang-up by client ends the call for the provider', true);

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
