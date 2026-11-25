// AYK-496: browser helpers for the filter tests (three screen sizes, signed-in accounts, reading what is shown).
import { chromium } from 'playwright';
import { BASE, fixtures, check, api } from './lib.mjs';

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1366, height: 768 },
};
export const wanted = (process.env.FILTERS_VIEWPORTS || 'mobile,tablet,desktop').split(',');
let browser;
export async function launch() { browser = browser || await chromium.launch({ channel: 'chromium' }); return browser; }
export async function close() { await browser?.close(); browser = null; }

// A page with the token of an account already in the browser (as after a sign-in).
export async function openAs({ token = null, adminToken = null, viewport = 'mobile' } = {}) {
  const b = await launch();
  const context = await b.newContext({ locale: 'ar-SA', viewport: VIEWPORTS[viewport], bypassCSP: true });
  await context.addInitScript(({ token: t, adminToken: a }) => {
    try { if (t) localStorage.setItem('lsm_token', t); if (a) localStorage.setItem('lsm_admin_token', a); localStorage.setItem('ayk_install_nudge_seen', '1'); } catch (_) { /* storage */ }
  }, { token, adminToken });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  return page;
}
export const goto = (page, route) => page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });

// The seeded titles carry their own number («طلب 17 …»), so what is shown maps back to the request id.
const requestByNumber = n => fixtures.requests[n - 1]?.id;
export async function requestIdsIn(page, scope = 'body') {
  const titles = await page.locator(`${scope} [data-testid="request-card"]`).allInnerTexts();
  return titles.map(text => { const m = text.match(/طلب\s+(\d+)\s/); return m ? requestByNumber(Number(m[1])) : null; }).filter(Boolean);
}
export async function providerIdsIn(page, scope = 'body') {
  const hrefs = await page.locator(`${scope} a[href^="/providers/"]`).evaluateAll(list => list.map(a => a.getAttribute('href')));
  return [...new Set(hrefs.map(h => Number(h.split('/')[2])).filter(Boolean))];
}
// Waits until the page stops loading: no pending list request and no skeleton / busy marker.
export async function settle(page, ms = 250) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
export { check, api, fixtures, BASE };
