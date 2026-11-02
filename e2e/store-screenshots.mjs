// AYK-166: real UI and API, synthetic users, opaque privacy masks, no external traffic.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { BASE, CLIENT, CONV, SOURCE_COMMIT } = process.env;
assert.match(BASE || '', /^http:\/\/ayk-shots-\d+-app:5000$/);
assert.ok(CLIENT && CONV);
const browser = await chromium.launch({ channel: 'chromium' });
const report = { sourceCommit: SOURCE_COMMIT, syntheticDataOnly: true, screenshots: [], checks: [] };
try {
  const context = await browser.newContext({ locale: 'ar-SA', bypassCSP: true,
    viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // Fail closed: the browser cannot load a third-party image, map, translator or production API.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === new URL(BASE).origin ? route.continue() : route.abort();
  });
  await context.addInitScript(token => {
    localStorage.setItem('lsm_token', token);
    localStorage.setItem('i18nextLng', 'ar');
  }, CLIENT);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const capture = async (name, extra = []) => {
    await page.evaluate(() => document.fonts.ready);
    const selectors = ['.ad-slot', '.avatar', '.chat-peer-name', '.conv-name-text', '[data-testid="chat-peer-code"]', '[data-testid="menu-your-number"]', ...extra];
    const masks = selectors.map(selector => page.locator(selector));
    const bytes = await page.screenshot({ path: `/out/${name}.png`, fullPage: false,
      animations: 'disabled', mask: masks, maskColor: '#64748b', omitBackground: false });
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1920);
    report.screenshots.push({ file: `${name}.png`, width: 1080, height: 1920,
      sha256: createHash('sha256').update(bytes).digest('hex'), masks: selectors });
  };
  await page.goto(`${BASE}/`);
  await page.getByTestId('providers-for-me').waitFor({ timeout: 30000 });
  await page.getByTestId('provider-card').first().waitFor({ timeout: 20000 });
  await capture('01-home', ['[data-testid="provider-card"] h3', '[data-testid="provider-card"] img']);
  report.checks.push('Authenticated home displays the seeded provider');
  await page.goto(`${BASE}/services`);
  const professions = page.getByTestId('professions');
  await professions.waitFor();
  assert.ok(await professions.getByTestId('profession-select').locator('option').count() >= 9);
  await capture('02-services');
  report.checks.push('Service catalogue displays at least nine profession options');
  await page.goto(`${BASE}/requests/new`);
  await page.locator('form').waitFor();
  await capture('03-request');
  report.checks.push('Authenticated request form renders');
  await page.goto(`${BASE}/chat/${CONV}`);
  const input = page.getByRole('textbox', { name: 'اكتب رسالة…' });
  await input.waitFor({ timeout: 30000 });
  const text = 'مرحبًا، أحتاج فحص الكهرباء المنزلية';
  await input.fill(text);
  await page.getByRole('button', { name: 'إرسال', exact: true }).click();
  await page.getByText(text, { exact: true }).waitFor({ timeout: 15000 });
  // Reload proves persistence through the actual API rather than optimistic rendering.
  await page.reload();
  await page.getByText(text, { exact: true }).waitFor({ timeout: 15000 });
  await capture('04-chat');
  report.checks.push('Chat message sent and persisted after reload');
  assert.deepEqual(errors, []);
  report.checks.push('No uncaught browser exceptions');
  report.passed = true;
} finally {
  await browser.close();
  await writeFile('/out/verification.json', JSON.stringify(report, null, 2));
}
console.log(`PASS ${report.screenshots.length} privacy-masked screenshots; ${report.checks.length} checks`);
