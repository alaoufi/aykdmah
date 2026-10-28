// Real two-browser chat test: text, a recorded voice message and a shared location
// sent by the client and received by the provider. Run via
// E2E_SCRIPT=chat.e2e.mjs bash deploy/e2e-calls.sh (same isolated staging app).
import { chromium } from 'playwright';

const { BASE, CONV, CLIENT, PROVIDER } = process.env;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

const browser = await chromium.launch({ channel: 'chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--unsafely-treat-insecure-origin-as-secure=${BASE}`],
});
async function party(token, label) {
  const context = await browser.newContext({
    permissions: ['microphone', 'geolocation'], geolocation: { latitude: 26.3260, longitude: 43.9750, accuracy: 15 },
    locale: 'ar-SA', bypassCSP: true, viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(value => localStorage.setItem('lsm_token', value), token);
  const page = await context.newPage();
  page.on('pageerror', err => console.log(`[${label} pageerror]`, err.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/favicon|manifest/.test(msg.text())) console.log(`[${label} console]`, msg.text().slice(0, 200)); });
  page.on('dialog', dialog => { console.log(`[${label} dialog]`, dialog.message()); dialog.dismiss(); });
  return { context, page };
}

const client = await party(CLIENT, 'client');
const provider = await party(PROVIDER, 'provider');
await client.page.goto(`${BASE}/chat/${CONV}`);
await provider.page.goto(`${BASE}/chat/${CONV}`);
const input = client.page.getByRole('textbox', { name: 'اكتب رسالة…' });
await input.waitFor({ timeout: 30000 });

// 1) Text.
await input.fill('مرحبا، متى تقدر تجي؟');
await client.page.getByRole('button', { name: 'إرسال', exact: true }).click();
await provider.page.getByText('مرحبا، متى تقدر تجي؟').waitFor({ timeout: 20000 }).then(() => check('text message reaches the provider', true))
  .catch(() => check('text message reaches the provider', false));

// 2) Voice message: record ~3 s from the fake microphone, preview, send.
await client.page.getByRole('button', { name: 'رسالة صوتية', exact: true }).click();
await client.page.getByRole('button', { name: /إيقاف التسجيل/ }).waitFor({ timeout: 15000 });
await client.page.waitForTimeout(3000);
await client.page.getByRole('button', { name: /إيقاف التسجيل/ }).click();
await client.page.getByText('استمع إلى التسجيل قبل إرساله').waitFor({ timeout: 10000 });
check('voice recording shows a preview before sending', true);
await client.page.getByRole('button', { name: 'إرسال', exact: true }).click();
const voice = provider.page.locator('audio.voice-player').first();
try {
  await voice.waitFor({ timeout: 20000 });
  // The provider downloads the recording and the browser decodes real audio from it.
  const audio = await voice.evaluate(async el => {
    const response = await fetch(el.currentSrc || el.src);
    const bytes = await response.arrayBuffer();
    let seconds = -1;
    try { seconds = (await new AudioContext().decodeAudioData(bytes.slice(0))).duration; } catch (_) { /* not decodable */ }
    return { status: response.status, type: response.headers.get('content-type'), size: bytes.byteLength, seconds };
  });
  check('voice message reaches the provider and plays real audio', audio.status === 200 && audio.seconds > 1.5,
    `HTTP ${audio.status} ${audio.type} ${audio.size} bytes ${audio.seconds.toFixed(1)} s`);
} catch (_) { check('voice message reaches the provider and its audio loads', false); }

// 3) Location.
await client.page.getByRole('button', { name: 'مشاركة الموقع', exact: true }).click();
const card = provider.page.locator('a.location-card').first();
try {
  await card.waitFor({ timeout: 20000 });
  const href = await card.getAttribute('href');
  const coords = await card.locator('.location-coords').innerText();
  check('shared location reaches the provider with a maps link', /26\.326/.test(coords) && /google|maps/.test(href || ''), `${coords} ${href?.slice(0, 60)}`);
  await card.scrollIntoViewIfNeeded();
  await provider.page.waitForTimeout(4000);
  const tiles = await card.locator('.map-thumb img').evaluateAll(imgs => imgs.filter(i => i.complete && i.naturalWidth > 0).length);
  check('location card shows a map preview', tiles >= 4, `${tiles}/9 map tiles loaded`);
  await card.screenshot({ path: '/e2e/location-card.png' }).catch(() => {});
} catch (_) { check('shared location reaches the provider with a maps link', false); }

// 4) Reply from the provider arrives back.
const providerInput = provider.page.getByRole('textbox', { name: 'اكتب رسالة…' });
await providerInput.fill('أجي بعد العصر');
await provider.page.getByRole('button', { name: 'إرسال', exact: true }).click();
await client.page.getByText('أجي بعد العصر').waitFor({ timeout: 20000 }).then(() => check('provider reply reaches the client', true))
  .catch(() => check('provider reply reaches the client', false));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
