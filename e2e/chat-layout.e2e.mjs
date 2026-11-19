import { chromium, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';

const { BASE, CLIENT, CONV } = process.env;
if (!/^http:\/\/ayk-shots-\d+-app:5000$/.test(BASE || '') || !CLIENT || !/^\d+$/.test(CONV || '')) {
  throw new Error('This test requires a disposable screenshot app and its seeded account.');
}
const checks = [];
let completed = false;
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const check = (name, ok) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
try {
  for (const [width, height, language, scale] of [
    [360, 640, 'ar', 'm'], [360, 640, 'ar', 'xl'],
    [390, 844, 'en', 'm'], [390, 844, 'en', 'xl'], [768, 1024, 'en', 'm'], [1280, 800, 'ar', 'm'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: language, bypassCSP: true });
    await context.addInitScript(({ token, language, scale }) => {
      localStorage.setItem('lsm_token', token);
      localStorage.setItem('lsm_lang', language);
      localStorage.setItem('ayk_theme_prefs', JSON.stringify({ mode: 'light', palette: 'sea', scale }));
    }, { token: CLIENT, language, scale });
    const page = await context.newPage();
    const errors = [];
    const networkErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => networkErrors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
    // Exercise this HTTP-only offline fixture without upgrading its document requests.
    // Remove just that directive from fixture documents, never from application code.
    if (engine === webkit) await page.route('**/*', async route => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      const headers = response.headers();
      if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy']
        .split(';').filter(directive => directive.trim() !== 'upgrade-insecure-requests').join(';');
      await route.fulfill({ response, headers });
    });
    // Expand the disposable account's real API result for a long-list scroll fixture.
    await page.route('**/api/chat/conversations', async route => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.data?.[0]) {
        const original = body.data[0];
        const peer = typeof original.other_user === 'string' ? JSON.parse(original.other_user) : original.other_user;
        body.data = Array.from({ length: 40 }, (_, index) => ({
          ...original, id: index === 0 ? Number(CONV) : 100000 + index,
          other_user: { ...peer, full_name: index % 2 ? 'مقدم خدمة تجريبي باسم طويل' : 'مقدم تجريبي', referral_code: 'ZX77' },
          last_message: { message_type: 'text', content: 'مرحبًا، متى يناسبك موعد الخدمة؟', created_at: new Date(Date.now() - index * 86400000).toISOString() },
          unread_count: index % 5 === 0 ? 3 : 0,
        }));
      }
      await route.fulfill({ response, json: body });
    });
    const label = `${width}x${height}-${language}-${scale}`;
    await page.goto(`${BASE}/chat`);
    await page.locator('.conv-item').nth(39).waitFor({ state: 'attached' }).catch(async error => {
      console.log('Fixture diagnostic', new URL(page.url()).pathname, errors, networkErrors.slice(0, 20),
        (await page.locator('body').innerText()).slice(0, 600));
      await page.screenshot({ path: '/out/failure.png' });
      throw error;
    });
    const header = page.locator('.sidebar-header');
    const initial = await header.boundingBox();
    await page.locator('.conv-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.mouse.wheel(0, 300);
    const after = await header.boundingBox();
    check(`${label}: header stays within viewport while list scrolls`,
      initial.y >= -1 && Math.abs(initial.y - after.y) < 1 && after.y + after.height <= height);
    const listBounds = await page.locator('.conv-list').boundingBox();
    if (width < 768) {
      const nav = page.getByTestId('mobile-bottom-nav');
      const bounds = await nav.count() ? await nav.boundingBox() : null;
      check(`${label}: bottom navigation remains visible and does not cover last row`,
        Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height + 1
          && listBounds.y + listBounds.height <= bounds.y + 2));
      await page.screenshot({ path: `/out/${label}.png` });
    }
    check(`${label}: list scrolls independently`, await page.locator('.conv-list').evaluate(el => el.scrollTop > 0));
    check(`${label}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByTestId('chat-menu').first().click();
    check(`${label}: header menu remains usable`, await page.getByTestId('chat-tab-archive').isVisible());
    await page.getByTestId('chat-tab-active').click();
    await page.goto(`${BASE}/chat/${CONV}`);
    const input = page.locator('.wa-pill input').first();
    await input.waitFor();
    if (width < 768) await page.setViewportSize({ width, height: 420 });
    await input.fill('رسالة اختبار التنسيق');
    const fieldBounds = await input.boundingBox();
    const threadHeader = await page.locator('.chat-header').boundingBox();
    check(`${label}: conversation header and composer fit reduced viewport`,
      threadHeader.y >= -1 && fieldBounds.y >= threadHeader.y + threadHeader.height
      && fieldBounds.y + fieldBounds.height <= (width < 768 ? 420 : height) + 1);
    if (width === 360 && scale === 'm') {
      await page.locator('.send-btn').click();
      const sent = page.locator('.bubble-row.mine .content').filter({ hasText: 'رسالة اختبار التنسيق' });
      await sent.waitFor();
      await page.reload();
      await sent.waitFor();
      check(`${label}: sent message persists after reload`, true);
    }
    await page.goto(`${BASE}/`);
    await page.waitForFunction(() => !document.querySelector('.chat-page') && document.querySelector('[data-testid="mobile-bottom-nav"]'));
    check(`${label}: leaving chat restores document scrolling and a single navigation`,
      !await page.evaluate(() => document.documentElement.classList.contains('chat-viewport-open'))
      && await page.getByTestId('mobile-bottom-nav').count() === 1);
    check(`${label}: no uncaught exceptions`, errors.length === 0);
    await context.close();
  }
  completed = true;
} finally {
  await browser.close();
  await writeFile('/out/chat-layout-results.json', JSON.stringify({ browser: engine.name(), checks, completed,
    passed: completed && checks.length === 47 && checks.every(c => c.ok) }, null, 2));
}
if (checks.some(c => !c.ok)) process.exitCode = 1;
