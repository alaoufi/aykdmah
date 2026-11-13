// Local build, synthetic accounts only. Never contacts production or sends SMS.
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const { BASE = 'http://127.0.0.1:4173', BROWSER = 'chromium', OUT = '/tmp/ayk200-browser' } = process.env;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error('Local fixture only');
const engine = BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const checks = [], errors = [];
let activePage;
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) console.error('FAIL', name, detail); };
await mkdir(OUT, { recursive: true });
try {
 for (const width of [320, 390, 430]) for (const scale of ['m', 'xl']) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA', serviceWorkers: 'block', bypassCSP: true });
  await context.addInitScript(({ scale }) => {
   localStorage.setItem('lsm_lang', 'ar');
   localStorage.setItem('ayk_theme_prefs', JSON.stringify({ mode: 'light', palette: 'sea', scale }));
  }, { scale });
  const page = await context.newPage(); activePage = page; page.on('pageerror', e => errors.push(e.message));
  let signed = false, deleteSuccess = false, rejectDelete = false, registrations = 0, deletions = 0;
  const user = { id: 900001, role: 'client', full_name: 'Synthetic user', phone: '+966500000001', is_active: 1, is_verified: 1, must_change_password: 0 };
  await page.route('**/*', async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin !== BASE) return route.abort();
   if (url.pathname.startsWith('/socket.io/')) return route.abort();
   if (!url.pathname.startsWith('/api/')) {
    if (engine === webkit && request.resourceType() === 'document') {
     const response = await route.fetch(); const headers = response.headers();
     if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].split(';').filter(x => x.trim() !== 'upgrade-insecure-requests').join(';');
     return route.fulfill({ response, headers });
    }
    return route.continue();
   }
   let data = [], status = 200, success = true;
   const endpoint = url.pathname.slice(4);
   if (endpoint === '/auth/phone-check') data = { available: true };
   if (endpoint === '/auth/phone-code') data = { required: false };
   if (endpoint === '/auth/register') { registrations++; signed = true; data = { user, token: 'synthetic-only', referral_code: 'ZZ99' }; }
   if (endpoint === '/auth/me') { data = { user }; if (!signed) { status = 401; success = false; } }
   if (endpoint === '/auth/logout') { signed = false; data = {}; }
   if (endpoint === '/users/me/delete') {
    deletions++;
    if (rejectDelete) { status = 409; success = false; data = {}; }
    else { deleteSuccess = true; data = { deleted: true }; }
   }
   if (endpoint === '/settings/public') data = { subscriptions_enabled: '0', terms_version: '1.0' };
   return route.fulfill({ status, json: { success, data, ...(success ? {} : { message: 'Synthetic rejected operation' }) } });
  });
  const prefix = `${BROWSER}/${width}/${scale}`;
  await page.goto(`${BASE}/delete-account`);
  const nav = page.getByTestId('mobile-bottom-nav'); await nav.waitFor();
  for (const scenario of ['initial', 'scroll', 'resize']) {
   if (scenario === 'scroll') await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
   if (scenario === 'resize') await page.setViewportSize({ width, height: 600 });
   await page.waitForFunction(() => {
    const panel = document.querySelector('[data-testid="mobile-bottom-nav"] > div');
    return panel && Math.abs(panel.getBoundingClientRect().bottom - (visualViewport.offsetTop + visualViewport.height)) < 2;
   }, null, { timeout: 2000 }).catch(() => {});
   const geometry = await nav.evaluate(el => {
    const panel = el.firstElementChild, rect = panel.getBoundingClientRect(), vp = visualViewport;
    return { bottom: rect.bottom, viewportBottom: vp.offsetTop + vp.height, width: document.documentElement.scrollWidth, viewportWidth: innerWidth };
   });
   check(`${prefix}/${scenario}: coloured panel reaches viewport bottom`, Math.abs(geometry.bottom - geometry.viewportBottom) < 2, geometry);
   check(`${prefix}/${scenario}: no horizontal overflow`, geometry.width <= geometry.viewportWidth + 2, geometry);
  }
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${BASE}/register`);
  await page.locator('#register-phone').fill('0500000001');
  await page.locator('input[autocomplete="new-password"]').fill('1234');
  await page.getByTestId('register-submit').click();
  const receipt = page.getByTestId('register-welcome'); await receipt.waitFor();
  check(`${prefix}: registered receipt survives session remount`, (await receipt.textContent()).includes('لقد تم التسجيل بنجاح') && registrations === 1);
  check(`${prefix}: registration heading is in visible viewport`, await receipt.locator('h2').evaluate(el => { const r=el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  await receipt.locator('a[href="/login"]').click();
  await page.waitForURL('**/login');
  await page.locator('input[autocomplete="username"]').waitFor();
  check(`${prefix}: registration link opens login`, new URL(page.url()).pathname === '/login' && await page.locator('input[autocomplete="username"]').count() === 1);
  await page.goto(`${BASE}/delete-account`);
  await page.getByTestId('delete-password').fill('1234');
  const confirmation = page.getByTestId('delete-sure').locator('..');
  await confirmation.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await confirmation.tap();
  check(`${prefix}: confirmation label is touch operable`, await page.getByTestId('delete-sure').isChecked());
  rejectDelete = true; await page.getByTestId('delete-submit').click(); await page.getByRole('alert').waitFor();
  check(`${prefix}: rejected deletion has no success`, !deleteSuccess && await page.getByTestId('delete-submit').count() === 1);
  rejectDelete = false; await page.getByTestId('delete-submit').click();
  await page.getByRole('heading', { name: 'لقد تم حذف الحساب بنجاح' }).waitFor();
  await page.waitForTimeout(500);
  check(`${prefix}: deletion receipt survives logout`, deletions === 2 && await page.getByTestId('delete-password').count() === 0 && await page.getByRole('heading', { name: 'لقد تم حذف الحساب بنجاح' }).count() === 1);
  check(`${prefix}: deletion heading clears sticky header`, await page.getByRole('heading', { name: 'لقد تم حذف الحساب بنجاح' }).evaluate(el => { const r=el.getBoundingClientRect(), header=document.querySelector('header')?.getBoundingClientRect(); return r.top >= (header?.bottom || 0) && r.bottom < innerHeight - 80; }));
  await page.screenshot({ path: `${OUT}/${BROWSER}-${width}-${scale}-deleted.png` });
  await page.getByRole('status').locator('a[href="/"]').click();
  await page.waitForURL(BASE + '/');
  check(`${prefix}: deletion link opens home`, new URL(page.url()).pathname === '/');
  await context.close();
 }
 check('no browser runtime exceptions', errors.length === 0, errors);
} catch (error) {
 if (activePage && !activePage.isClosed()) {
  await activePage.screenshot({ path: `${OUT}/${BROWSER}-failure.png` });
  console.log(await activePage.evaluate(() => JSON.stringify({ scroll: scrollY, height: innerHeight, header: document.querySelector('header')?.getBoundingClientRect().toJSON(), checkbox: document.querySelector('[data-testid="delete-sure"]')?.getBoundingClientRect().toJSON(), body: document.body.scrollHeight, zoom: getComputedStyle(document.documentElement).zoom })));
 }
 check('suite completes', false, error.stack);
}
finally {
 await browser.close(); await writeFile(`${OUT}/${BROWSER}.json`, JSON.stringify({ checks, errors }, null, 2));
 console.log(JSON.stringify({ browser: BROWSER, passed: checks.filter(x=>x.ok).length, failed: checks.filter(x=>!x.ok).length }));
 if (checks.some(x => !x.ok)) process.exitCode = 1;
}
