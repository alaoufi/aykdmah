// Home page by area and profession (AYK-035): the requester sees the provider covering
// their neighbourhood, can browse another neighbourhood, and sees no region menus; the
// provider sees the open request in their area and profession.
// Run via E2E_SCRIPT=home.e2e.mjs bash deploy/e2e-calls.sh
import { chromium } from 'playwright';

const { BASE, CLIENT, PROVIDER } = process.env;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };
const browser = await chromium.launch({ channel: 'chromium' });
async function open(token) {
  const context = await browser.newContext({ locale: 'ar-SA', bypassCSP: true, viewport: { width: 390, height: 844 } });
  await context.addInitScript(value => localStorage.setItem('lsm_token', value), token);
  const page = await context.newPage();
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  return page;
}

const client = await open(CLIENT);
await client.goto(`${BASE}/`);
const section = client.getByTestId('providers-for-me');
await section.waitFor({ timeout: 30000 });
await section.getByTestId('provider-card').first().waitFor({ timeout: 15000 }).catch(() => {});
check('requester sees the provider covering their neighbourhood', await section.getByText('مقدم تجريبي').count() > 0);
check('no region menus on the home page', !(await client.getByText('كل المناطق المتاحة').count()));
await client.getByRole('button', { name: 'المزيد' }).first().click();
check('"Your number" and "Edit your area" at the top of the ☰ menu', await client.getByTestId('menu-your-number').isVisible() && await client.getByTestId('edit-area').isVisible());
await client.keyboard.press('Escape');
await section.screenshot({ path: '/e2e/home-client.png' });
await client.evaluate(() => window.scrollTo(0, 0));
await client.screenshot({ path: '/e2e/home-top.png' });

await client.goto(`${BASE}/services/category/electrical`);
await client.getByText('مقدم تجريبي').first().waitFor({ timeout: 20000 }).then(() => check('profession page lists providers in the neighbourhood', true))
  .catch(() => check('profession page lists providers in the neighbourhood', false));
check('no region menus on the profession page', !(await client.getByRole('combobox', { name: 'المنطقة' }).count()));
await client.screenshot({ path: '/e2e/category-client.png', fullPage: false });

// Another neighbourhood (several homes): the provider does not cover it.
await client.goto(`${BASE}/`);
await section.waitFor({ timeout: 20000 });
await section.getByRole('button', { name: /حي آخر/ }).click();
const picker = section.getByTestId('other-district');
const city = picker.getByRole('combobox').first();
await city.locator('option').nth(2).waitFor({ state: 'attached', timeout: 15000 });
await city.selectOption({ index: 2 });
const district = picker.getByRole('combobox').nth(1);
await district.locator('option').nth(1).waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
if (await district.locator('option').count() > 1) {
  await district.selectOption({ index: 1 });
  await section.getByText(/تعرض الآن/).waitFor({ timeout: 15000 });
  check('another neighbourhood can be browsed', true);
  await section.getByRole('button', { name: /العودة لحيي/ }).click();
  await section.getByText('مقدم تجريبي').waitFor({ timeout: 15000 }).then(() => check('back to my neighbourhood', true)).catch(() => check('back to my neighbourhood', false));
} else check('another neighbourhood can be browsed', false, 'no districts in the chosen city');

// Services page: every profession in a dropdown, and area numbers inside each card.
await client.goto(`${BASE}/services`);
const professions = client.getByTestId('professions');
await professions.waitFor({ timeout: 30000 });
await professions.getByTestId('area-totals').waitFor({ timeout: 15000 }).catch(() => {});
check('profession dropdown lists every profession', await professions.getByTestId('profession-select').locator('option').count() >= 9);
check('profession cards show providers in the area', await professions.getByText(/مقدم خدمة في منطقتك/).count() > 0);
await professions.scrollIntoViewIfNeeded();
await client.screenshot({ path: '/e2e/professions.png' });
await professions.getByTestId('profession-select').selectOption('electrical');
await client.waitForURL(/\/services\/category\/electrical/, { timeout: 10000 }).then(() => check('choosing a profession opens its page', true))
  .catch(() => check('choosing a profession opens its page', false));

const provider = await open(PROVIDER);
await provider.goto(`${BASE}/`);
const requests = provider.getByTestId('requests-for-me');
await requests.waitFor({ timeout: 30000 });
await requests.getByText('إصلاح فيش كهرباء').waitFor({ timeout: 15000 }).then(() => check('provider sees the open request in their area and profession', true))
  .catch(() => check('provider sees the open request in their area and profession', false));
await requests.screenshot({ path: '/e2e/home-provider.png' });
await provider.goto(`${BASE}/profile`);
const market = provider.getByTestId('my-market');
await market.waitFor({ timeout: 15000 }).catch(() => {});
check('provider sees their market numbers', await market.getByText(/طالب خدمة مسجل في نطاقك/).count() > 0);
await market.screenshot({ path: '/e2e/my-market.png' }).catch(() => {});

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
