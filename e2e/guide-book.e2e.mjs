// Isolated UI fixture: all API traffic is synthetic and no production host is allowed.
// BASE=http://127.0.0.1:4173 BROWSER=chromium|webkit OUT=/out node guide-book.e2e.mjs
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const { BASE, BROWSER = 'chromium', OUT = '/out' } = process.env;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost|ayk-shots-\d+-app)(?::\d+)?$/.test(BASE || '')) throw Error('Use a localhost or isolated fixture app');
if (!['chromium', 'webkit'].includes(BROWSER)) throw Error('BROWSER must be chromium or webkit');
const engine = BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) throw Error(name);
};
const allPermissions = ['users.manage', 'locations.manage', 'categories.manage', 'conversations.read', 'requests.manage', 'ads.manage', 'wallets.manage', 'settings.manage'];
await mkdir(OUT, { recursive: true });

async function fixture({ width, lang, large = false, admin = false, permissions = allPermissions }) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, locale: lang, reducedMotion: large ? 'reduce' : 'no-preference', bypassCSP: true, serviceWorkers: 'block' });
  await context.addInitScript(({ lang, admin }) => {
    localStorage.setItem('lsm_lang', lang);
    if (admin) localStorage.setItem('lsm_admin_token', 'synthetic-guide-admin');
  }, { lang, admin });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const data = url.pathname === '/api/auth/me'
        ? { user: { id: 987654, full_name: 'Synthetic Guide Administrator', role: 'admin', is_active: 1, is_super_admin: 0, permissions }, provider: null }
        : [];
      return route.fulfill({ status: 200, json: { success: true, data } });
    }
    if (engine === webkit && route.request().resourceType() === 'document') {
      const response = await route.fetch();
      const headers = response.headers();
      if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].split(';').filter(value => value.trim() !== 'upgrade-insecure-requests').join(';');
      return route.fulfill({ response, headers });
    }
    return route.continue();
  });
  const prefix = `${BROWSER}/${width}/${lang}/${large ? '200%-reduced' : 'normal'}/${admin ? 'admin' : 'public'}`;
  const book = page.getByTestId('guide-book');
  const select = book.locator('select');
  const goto = async path => {
    await page.goto(BASE + path);
    await book.waitFor();
    await page.waitForFunction(() => document.documentElement.lang.length > 0);
    if (large) await page.addStyleTag({ content: 'html { font-size:32px !important; }' });
    check(`${prefix}: document direction`, await page.locator('html').getAttribute('dir') === (lang === 'ar' ? 'rtl' : 'ltr'));
  };
  const assertPage = async index => {
    await page.waitForFunction(value => document.querySelector('[data-testid="guide-book"] select')?.value === String(value), index);
    check(`${prefix}: chapter ${index + 1} has readable content`, Boolean((await book.locator('.guide-book-chapter').textContent())?.trim())
      && await book.locator('.guide-book-page > section').count() === 1);
    const image = book.locator('.guide-book-picture img');
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.guide-book-picture img');
      return image?.complete && image.naturalWidth > 0;
    });
    const imageUrl = await image.getAttribute('src');
    const imageResponse = await context.request.get(BASE + imageUrl);
    check(`${prefix}: chapter ${index + 1} image responds 200`, imageResponse.status() === 200);
    await book.locator('.guide-book-spread').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth,
      book: document.querySelector('[data-testid="guide-book"]').scrollWidth,
      width: document.querySelector('[data-testid="guide-book"]').clientWidth,
      overflowing: [...document.querySelectorAll('[data-testid="guide-book"] *')].filter(el => el.scrollWidth > el.clientWidth + 2).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, scroll: el.scrollWidth, width: el.clientWidth })) }));
    check(`${prefix}: chapter ${index + 1} fits horizontally`, size.document <= size.viewport + 2 && size.book <= size.width + 2, JSON.stringify(size));
    if (large) check(`${prefix}: chapter ${index + 1} honors reduced motion`, await book.locator('.guide-book-spread').evaluate(el => getComputedStyle(el).animationName) === 'none');
  };
  return { context, page, book, select, errors, prefix, goto, assertPage };
}

try {
  for (const width of [320, 390, 768, 1440]) for (const lang of ['ar', 'en']) for (const large of [false, true]) {
    const f = await fixture({ width, lang, large });
    try {
      await f.goto('/guide#guide-calls');
      check(`${f.prefix}: initial call deep link selects chapter`, await f.select.inputValue() === '5');
      const chapters = await f.select.locator('option').count();
      check(`${f.prefix}: all public chapters available`, chapters === 11);
      for (let i = 0; i < chapters; i++) { await f.select.selectOption(String(i)); await f.assertPage(i); }
      await f.select.selectOption('0');
      const previous = f.book.locator('nav button').nth(0), next = f.book.locator('nav button').nth(1);
      check(`${f.prefix}: previous disabled on first page`, await previous.isDisabled());
      await next.click();
      await f.page.waitForFunction(() => document.activeElement?.classList.contains('guide-book-chapter'));
      check(`${f.prefix}: next selects and focuses chapter`, await f.select.inputValue() === '1');
      await previous.click();
      check(`${f.prefix}: previous returns to first chapter`, await f.select.inputValue() === '0');
      await f.select.selectOption(String(chapters - 1));
      check(`${f.prefix}: next disabled on last page`, await next.isDisabled());
      await f.page.locator('a[href="#guide-provider"]').click();
      await f.page.waitForFunction(() => document.querySelector('.guide-book-index select')?.value === '1');
      check(`${f.prefix}: existing role anchor still navigates book`, new URL(f.page.url()).hash === '#guide-provider');
      await f.page.evaluate(() => { location.hash = '#guide-faq-dispute'; });
      await f.page.waitForFunction(() => document.querySelector('.guide-book-index select')?.value === '8');
      check(`${f.prefix}: nested FAQ deep link mounts its target`, await f.page.locator('#guide-faq-dispute').count() === 1);
      await f.page.screenshot({ path: `${OUT}/guide-${BROWSER}-${width}-${lang}-${large ? 'large' : 'normal'}.png` });
      check(`${f.prefix}: no runtime errors`, f.errors.length === 0, f.errors.join('; '));
    } finally { await f.context.close(); }
  }
  for (const lang of ['ar', 'en']) {
    const f = await fixture({ width: 390, lang, large: true, admin: true });
    try {
      await f.goto('/admin/guide#admin-guide-settings');
      check(`${f.prefix}: admin route and sidebar guide link present`, await f.page.locator('a[href="/admin/guide"]').count() > 0);
      check(`${f.prefix}: all authorized admin chapters available`, await f.select.locator('option').count() === 8);
      check(`${f.prefix}: initial admin deep link selects chapter`, await f.select.inputValue() === '7');
      const hrefs = ['/admin/users', '/admin/locations', '/admin/categories', '/admin/conversations', '/admin/requests', '/admin/ads', '/admin/wallets', '/admin/settings'];
      for (let i = 0; i < hrefs.length; i++) {
        await f.select.selectOption(String(i)); await f.assertPage(i);
        check(`${f.prefix}: chapter ${i + 1} links to real admin surface`, await f.book.locator(`a[href="${hrefs[i]}"]`).count() === 1);
      }
      check(`${f.prefix}: no runtime errors`, f.errors.length === 0, f.errors.join('; '));
      await f.page.screenshot({ path: `${OUT}/guide-admin-${BROWSER}-${lang}.png` });
    } finally { await f.context.close(); }
    const restricted = await fixture({ width: 320, lang, admin: true, permissions: ['locations.manage'] });
    try {
      await restricted.goto('/admin/guide');
      check(`${restricted.prefix}: unauthorized chapters excluded`, await restricted.select.locator('option').count() === 1);
      check(`${restricted.prefix}: only authorized chapter links rendered`, await restricted.book.locator('a[href="/admin/locations"]').count() === 1
        && await restricted.book.locator('a[href="/admin/users"],a[href="/admin/settings"]').count() === 0);
      await restricted.assertPage(0);
      check(`${restricted.prefix}: no runtime errors`, restricted.errors.length === 0, restricted.errors.join('; '));
    } finally { await restricted.context.close(); }
  }
  const visitor = await browser.newContext();
  try {
    const page = await visitor.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
    await page.goto(BASE + '/admin/guide');
    await page.waitForURL(/\/admin\/login/);
    check(`${BROWSER}: unauthenticated visitors cannot open admin guide`, await page.getByTestId('guide-book').count() === 0);
  } finally { await visitor.close(); }
} finally {
  await browser.close();
  await writeFile(`${OUT}/guide-${BROWSER}-checks.json`, JSON.stringify(results, null, 2));
}
