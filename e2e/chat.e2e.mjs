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
// WhatsApp style (AYK-047): hold the mic for 3 s, release, and it is sent at once.
const mic = client.page.getByTestId('voice-button');
await mic.waitFor({ timeout: 15000 });
const box = await mic.boundingBox();
await client.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await client.page.mouse.down();
await client.page.getByText('ارفع إصبعك للإرسال').waitFor({ timeout: 15000 });
check('holding the mic records (release-to-send hint shown)', true);
await client.page.waitForTimeout(3000);
await client.page.mouse.up();
const voice = provider.page.locator('audio.voice-player').first();
try {
  await voice.waitFor({ state: 'attached', timeout: 20000 });
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

// 5) A photo, rendered in the WhatsApp-style bubble and opened full screen.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await client.page.locator('input[type=file][multiple]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
await client.page.getByRole('button', { name: 'إرسال', exact: true }).click();
try {
  await provider.page.locator('button.wa-photo img').first().waitFor({ timeout: 20000 });
  await provider.page.locator('button.wa-photo').first().click();
  await provider.page.locator('.wa-viewer img').waitFor({ timeout: 5000 });
  await provider.page.getByRole('button', { name: 'إغلاق' }).first().click().catch(() => provider.page.keyboard.press('Escape'));
  check('photo reaches the provider and opens full screen', true);
} catch (_) { check('photo reaches the provider and opens full screen', false); }

// 6) Delete: only the author has the option; after confirming it disappears for both.
const theirs = client.page.locator('.bubble-row.theirs', { hasText: 'أجي بعد العصر' });
await theirs.locator('.bubble').hover();
await theirs.getByRole('button', { name: 'المزيد' }).click();
check('the receiver cannot delete the other person\'s message', !(await theirs.getByRole('button', { name: /حذف الرسالة/ }).count()));
await client.page.keyboard.press('Escape');
await client.page.mouse.move(0, 0);
const mine = client.page.locator('.bubble-row.mine', { hasText: 'مرحبا، متى تقدر تجي؟' });
await mine.locator('.bubble').hover();
await mine.getByRole('button', { name: 'المزيد' }).click();
await mine.getByRole('button', { name: /حذف الرسالة/ }).click();
await client.page.getByRole('dialog').getByRole('button', { name: 'حذف الرسالة' }).click();
await client.page.waitForTimeout(3000);
const goneClient = !(await client.page.getByText('مرحبا، متى تقدر تجي؟').count());
await provider.page.reload();
await provider.page.getByText('أجي بعد العصر').waitFor({ timeout: 20000 });
const goneProvider = !(await provider.page.getByText('مرحبا، متى تقدر تجي؟').count());
check('author deletes after confirming; gone for both', goneClient && goneProvider, `client ${goneClient} provider ${goneProvider}`);
check('admin notice is shown under the chat', await client.page.getByText('الإدارة تستطيع الاطلاع على المحادثات لحفظ الحقوق عند الخلاف').isVisible());
await provider.page.screenshot({ path: '/e2e/chat-wa.png' });

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
