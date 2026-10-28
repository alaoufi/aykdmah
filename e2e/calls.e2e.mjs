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
check('voice: client hears provider (remote audio track live)', voiceCaller.remoteAudioLive);
check('voice: provider hears client (remote audio track live)', voiceCallee.remoteAudioLive);
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
await button(callee.page, 'رد').click();
await Promise.all([inCall(caller.page), inCall(callee.page)]);
await caller.page.waitForTimeout(4000);
const videoCaller = await mediaState(caller.page), videoCallee = await mediaState(callee.page);
check('video: client receives provider video', videoCaller.videoSizes[0] > 0, `sizes ${videoCaller.videoSizes}`);
check('video: provider receives client video', videoCallee.videoSizes[0] > 0, `sizes ${videoCallee.videoSizes}`);
await button(callee.page, 'إيقاف الكاميرا').click();
check('video: camera off toggles', await button(callee.page, 'تشغيل الكاميرا').isVisible());

// Outsider: knows the call id and asks for a token / tries to end it.
const active = await caller.page.evaluate(async () => (await (await fetch('/api/calls/active', { headers: { Authorization: `Bearer ${localStorage.getItem('lsm_token')}` } })).json()).data);
const callId = active[0]?.id;
for (const action of ['token', 'accept', 'decline']) {
  const res = await fetch(`${BASE}/api/calls/${callId}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${OUTSIDER}` } });
  check(`outsider ${action} refused`, res.status === 404, `HTTP ${res.status}`);
}

await callee.context.setOffline(true);
await callee.page.waitForTimeout(4000);
await callee.context.setOffline(false);
await inCall(callee.page);
await callee.page.waitForTimeout(4000);
const afterDrop = await mediaState(caller.page);
check('video: call survives a 4 s network drop', afterDrop.remoteAudioLive, `sizes ${afterDrop.videoSizes}`);
await button(caller.page, 'إنهاء المكالمة').click();
await callee.page.locator('[role="dialog"]').getByText('انتهت المكالمة').waitFor({ timeout: 15000 });
check('video: hang-up by client ends the call for the provider', true);

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
