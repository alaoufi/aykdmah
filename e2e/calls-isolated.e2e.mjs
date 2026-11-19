// Real calls between two independent Chromium contexts using fake media and
// this run's private synthetic LiveKit/app/database. Reproduce with the recorded
// docs/call-review/ayk175-isolated/harness-used.sh and its seed/adapt helpers.
// Do not run through deploy/e2e-calls.sh, which uses the production SFU/network.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const OUT=process.env.OUT;
await mkdir(OUT,{recursive:true});
const redact=value=>String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted-token]').replace(/access_token=[^&\s]+/g,'access_token=[redacted]');
for(const method of ['log','error','warn']){const log=console[method].bind(console);console[method]=(...args)=>log(...args.map(v=>typeof v==='string'?redact(v):v));}

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
  const signalSockets=[],presence={connected:false};
  page.on('websocket',socket=>{const url=new URL(socket.url());if(url.pathname.startsWith('/socket.io')){socket.on('framereceived',frame=>{if(typeof frame.payload==='string'&&/^40(?:\{|$)/.test(frame.payload))presence.connected=true;});return;}if(url.port!=='7880')return;const record={path:url.pathname,openedAt:Date.now(),closedAt:null};signalSockets.push(record);socket.on('close',()=>{record.closedAt=Date.now();});});
  page.on('pageerror', err => console.log(`[${label} pageerror]`, err.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/favicon|manifest/.test(msg.text())) console.log(`[${label} console]`, msg.text().slice(0, 200)); });
  return { context, page, signalSockets, presence };
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

let caller,callee;
try {
caller = await party(CLIENT, 'client');
callee = await party(PROVIDER, 'provider');
await callee.page.goto(`${BASE}/`);
await caller.page.goto(`${BASE}/chat/${CONV}`);
await caller.page.getByRole('button', { name: 'اتصال صوتي' }).first().waitFor({ timeout: 30000 });

const presenceDeadline=Date.now()+15000;while(Date.now()<presenceDeadline&&!(caller.presence.connected&&callee.presence.connected))await new Promise(r=>setTimeout(r,100));
check('both browser sessions are authenticated over Socket.IO',caller.presence.connected&&callee.presence.connected);
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
check('video: camera remains off during the browser offline interval', await button(callee.page, 'تشغيل الكاميرا').isVisible()
  && await callee.page.evaluate(() => window.cameraCaptureRequests) === capturesBeforeReconnect);
await callee.context.setOffline(false);
await inCall(callee.page);
await callee.page.waitForTimeout(4000);
check('video: camera is still off after the browser actually returns online', await button(callee.page, 'تشغيل الكاميرا').isVisible() && await callee.page.evaluate(()=>window.cameraCaptureRequests)===capturesBeforeReconnect);
const afterDrop = await mediaState(caller.page);
// Playwright offline mode tests browser connectivity events; it does not prove
// that UDP media packets were dropped. Do not label this a packet-loss test.
check('video: remote track remains live after a 4 s browser offline toggle', afterDrop.remoteAudioLive, `sizes ${afterDrop.videoSizes}`);
for (const [label, party] of [['client', caller], ['provider', callee]]) {
  const sound = await decodedSound(party.page);
  check(`video: ${label} receives decoded audio after browser returns online`, sound.activeFrames > 0, JSON.stringify(sound));
}
// A real, isolated SFU network outage: the host disconnects ONLY this run's
// private LiveKit container for 18 seconds, then restores the same private IP.
const socketsBeforeCut={client:caller.signalSockets.length,provider:callee.signalSockets.length};
await writeFile(OUT+'/sfu-cut.ready','ready');
const until=Date.now()+45000;
while(Date.now()<until){try{if((await readFile(OUT+'/sfu-cut.done','utf8')).trim()==='restored')break;}catch{}await new Promise(r=>setTimeout(r,250));}
check('isolated SFU network was interrupted and restored', await readFile(OUT+'/sfu-cut.done','utf8').then(v=>v.trim()==='restored').catch(()=>false));
await Promise.all([inCall(caller.page),inCall(callee.page)]);
for(const [label,party] of [['client',caller],['provider',callee]]){
 let sound;for(let attempt=0;attempt<6;attempt++){sound=await decodedSound(party.page);if(sound.activeFrames>0)break;await new Promise(r=>setTimeout(r,1000));}
 check('network recovery: '+label+' receives non-silent decoded audio',sound.activeFrames>0,JSON.stringify(sound));
 check('network recovery: '+label+' established a fresh LiveKit signaling connection',party.signalSockets.length>socketsBeforeCut[label]);
}
check('network recovery: provider camera stays off without a new capture', await button(callee.page,'تشغيل الكاميرا').isVisible() && await callee.page.evaluate(()=>window.cameraCaptureRequests)===capturesBeforeReconnect);
await writeFile(OUT+'/signaling.json',JSON.stringify({client:caller.signalSockets,provider:callee.signalSockets},null,2));

await button(caller.page, 'إنهاء المكالمة').click();
await callee.page.locator('[role="dialog"]').getByText('انتهت المكالمة').waitFor({ timeout: 15000 });
check('video: hang-up by client ends the call for the provider', true);

} catch(error) {
 const pages={};
 for(const [label,party] of [['client',caller],['provider',callee]]){if(!party)continue;await party.page.screenshot({path:OUT+'/'+label+'-failure.png'}).catch(()=>{});pages[label]={url:party.page.url(),body:await party.page.locator('body').innerText().then(v=>redact(v).slice(0,6000)).catch(()=>null),signalSockets:party.signalSockets};}
 await writeFile(OUT+'/failure.json',JSON.stringify({message:redact(error.message),pages},null,2));
 throw new Error(redact(error.message));
} finally {await writeFile(OUT+'/results.json',JSON.stringify(results,null,2));await browser.close();}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if(failed.length)process.exitCode=1;
