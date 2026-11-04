// Synthetic browser contract. Every API request is fulfilled locally by this
// test; it never writes to the app database. Run on a disposable/local build.
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const { BASE, BROWSER = 'chromium', OUT = '/out' } = process.env;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost|ayk-shots-\d+-app)(?::\d+)?$/.test(BASE || '')) throw Error('Use a local/disposable HTTP app only');
const engine = BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const checks = [];
const apiCalls = [];
const scrollTrace = [];
let activePage;
const check = (name, ok) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw Error(name); };
await mkdir(OUT, { recursive: true });
try {
  for (const width of [390, 768, 1440]) {
    // Page routing cannot intercept requests issued by a controlling service
    // worker. This synthetic API contract must never fall through to the
    // static SPA server and interpret index.html as a catalog/API response.
    const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'en', bypassCSP: true, serviceWorkers: 'block' });
    await context.addInitScript(() => { localStorage.setItem('lsm_admin_token', 'synthetic-admin'); localStorage.setItem('lsm_lang', 'en'); });
    const page = await context.newPage();
    activePage = page;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let userId = 700, permissions = ['locations.manage', 'categories.manage', 'services.manage'];
    let writes = 0, districtReads = 0;
    let districts = Array.from({ length: 70 }, (_, i) => ({ id: i + 100, city_id: 9, name_ar: `حي تجريبي ${i}`, name_en: `District ${String(i).padStart(2, '0')}`, is_active: 1 }));
    const categories = [{ id: 5, name_ar: 'الكهرباء', name_en: 'Electrical', slug: 'electrical', services_count: 1, is_active: 1 }];
    const services = [{ id: 11, category_id: 5, name_ar: 'خدمة تجريبية', name_en: 'Synthetic Service', is_active: 1, is_urgent_supported: 1 }];
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method(), pathname = url.pathname.replace(/^\/api/, '');
      apiCalls.push({ width, method, path: pathname, query: url.search });
      let data = [];
      if (method !== 'GET') writes++;
      if (pathname === '/auth/me') data = { user: { id: userId, full_name: 'Synthetic Administrator', role: 'admin', is_active: 1, is_super_admin: 0, permissions }, provider: null };
      else if (pathname === '/countries/admin/all') data = [{ id: 1, name_ar: 'السعودية', name_en: 'Saudi Arabia', is_active: 1, code: 'SA', currency_code: 'SAR' }];
      else if (pathname === '/regions') data = [{ id: 4, country_id: 1, name_ar: 'القصيم', name_en: 'Qassim', is_active: 1 }];
      else if (pathname === '/cities') data = [{ id: 9, region_id: 4, name_ar: 'بريدة', name_en: 'Buraidah', is_active: 1 }];
      else if (/^\/districts/.test(pathname)) {
        if (method === 'GET') { districtReads++; await new Promise(resolve => setTimeout(resolve, 75)); data = districts; }
        else if (method === 'POST') { data = { ...req.postDataJSON(), id: 999, is_active: 1 }; districts = [...districts, data]; }
        else if (method === 'PUT') { const id = Number(pathname.split('/').at(-1)); districts = districts.map(d => d.id === id ? { ...d, ...req.postDataJSON() } : d); data = districts.find(d => d.id === id); }
        else if (method === 'DELETE') districts = districts.filter(d => d.id !== Number(pathname.split('/').at(-1)));
      } else if (pathname === '/categories') data = categories;
      else if (pathname === '/services') {
        if (method === 'POST') { data = { ...req.postDataJSON(), id: 33 }; services.push(data); categories[0].services_count = services.length; }
        else data = services;
      }
      await route.fulfill({ status: method === 'POST' && ['/districts', '/services'].includes(pathname) ? 201 : 200, json: { success: true, data } });
    });
    if (engine === webkit) await page.route('**/*', async route => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch(), headers = response.headers();
      if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].split(';').filter(value => value.trim() !== 'upgrade-insecure-requests').join(';');
      await route.fulfill({ response, headers });
    });
    await page.goto(`${BASE}/admin/locations`);
    await page.getByRole('button', { name: /Saudi Arabia/ }).click();
    await page.getByRole('button', { name: 'Qassim', exact: true }).click();
    await page.getByRole('button', { name: /Buraidah/ }).click();
    await page.getByTestId('admin-districts').getByText('District 69', { exact: true }).first().waitFor();
    check(`${width}: one contextual back control`, await page.getByRole('button', { name: 'Back', exact: true }).count() === 1);
    await page.evaluate(() => window.scrollTo(0, 600));
    const y = await page.evaluate(() => window.scrollY);
    const traceScroll = async label => scrollTrace.push({ width, label, ...await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight, active: document.activeElement?.tagName })) });
    await traceScroll('before-open');
    await page.getByTestId('admin-districts').getByRole('button', { name: 'New', exact: true }).evaluate(button => button.click());
    const form = page.locator('#admin-district-form');
    await traceScroll('after-open');
    const beforeInvalidDistrict = writes;
    await page.locator('button[form="admin-district-form"]').click();
    check(`${width}: geographic required error is inline and prevents mutation`, writes === beforeInvalidDistrict
      && await form.locator('input').first().getAttribute('aria-invalid') === 'true'
      && await form.getByRole('alert').count() > 0);
    await form.locator('input').nth(0).fill('حي مضاف تجريبي'); await form.locator('input').nth(1).fill('Synthetic Added');
    await traceScroll('after-fill');
    const beforeRead = districtReads;
    await page.locator('button[form="admin-district-form"]').click();
    await form.waitFor({ state: 'detached' });
    await page.getByText('Synthetic Added', { exact: true }).first().waitFor();
    await traceScroll('after-save');
    check(`${width}: add preserves city and document scroll during background refresh`, districtReads > beforeRead && Math.abs(await page.evaluate(() => window.scrollY) - y) < 3);
    await page.reload(); await page.getByTestId('admin-districts').waitFor();
    await page.getByText('Synthetic Added', { exact: true }).first().waitFor();
    check(`${width}: user-scoped context survives reload`, await page.getByText('Buraidah', { exact: true }).count() > 0);
    // The action's immediate parent is the location row (rather than all ancestors).
    const firstEdit = page.getByTestId('admin-districts').getByRole('button', { name: 'Edit', exact: true }).first();
    await firstEdit.click();
    const beforeCancel = writes;
    await page.locator('#admin-district-form input').first().fill('تعديل ملغى');
    await page.locator('button[form="admin-district-form"]').click();
    await page.getByTestId('app-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    check(`${width}: cancelled edit makes no API mutation and retains form`, writes === beforeCancel && await page.locator('#admin-district-form').isVisible());
    await page.locator('.modal-footer').getByRole('button', { name: 'Cancel', exact: true }).click();
    const firstDelete = page.getByTestId('admin-districts').getByRole('button', { name: 'Delete', exact: true }).first();
    await firstDelete.click(); await page.getByTestId('app-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    check(`${width}: cancelled deletion makes no API mutation`, writes === beforeCancel);
    userId = 701; await page.reload(); await page.getByRole('button', { name: /Saudi Arabia/ }).waitFor();
    check(`${width}: another administrator does not inherit location selection`, await page.getByTestId('admin-districts').count() === 0);
    await page.getByRole('button', { name: /Saudi Arabia/ }).click();
    await page.getByRole('button', { name: 'Qassim', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    check(`${width}: contextual back returns one geographic level`, await page.getByRole('button', { name: 'Qassim', exact: true }).count() === 0);
    permissions = ['categories.manage']; await page.goto(`${BASE}/admin/categories`);
    await page.getByRole('button', { name: /Electrical/ }).click();
    await page.getByText('Synthetic Service', { exact: true }).waitFor();
    check(`${width}: category-only administrator has no subservice mutation controls`, await page.getByRole('button', { name: '+ Services', exact: true }).count() === 0);
    await page.getByRole('button', { name: 'New', exact: true }).first().click();
    const beforeInvalidCategory = writes;
    await page.locator('button[form="AdminCategoriesPage-form"]').click();
    check(`${width}: category required error is inline and prevents mutation`, writes === beforeInvalidCategory
      && await page.locator('#AdminCategoriesPage-form input').first().getAttribute('aria-invalid') === 'true');
    await page.locator('.modal-footer').getByRole('button', { name: 'Cancel', exact: true }).click();
    permissions.push('services.manage'); await page.reload();
    await page.getByRole('button', { name: /Electrical/ }).click();
    await page.getByRole('button', { name: '+ Services', exact: true }).click();
    const beforeInvalid = writes;
    await page.locator('button[form="admin-subservice-form"]').click();
    check(`${width}: required subservice name is marked with an inline reason before writing`,
      writes === beforeInvalid && await page.locator('#admin-subservice-form input').first().getAttribute('aria-invalid') === 'true'
      && await page.locator('#admin-subservice-form').getByRole('alert').count() > 0);
    await page.locator('#admin-subservice-form input').first().fill('خدمة جديدة تجريبية');
    check(`${width}: subservice create locks the selected category`, await page.locator('#admin-subservice-form select').isDisabled());
    await page.locator('button[form="admin-subservice-form"]').click();
    await page.locator('#admin-subservice-form').waitFor({ state: 'detached' });
    await page.getByText('خدمة جديدة تجريبية', { exact: true }).waitFor();
    check(`${width}: category remains expanded after adding a subservice`, await page.getByRole('button', { name: '+ Services', exact: true }).isVisible());
    check(`${width}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check(`${width}: no client runtime errors`, errors.length === 0);
    await page.screenshot({ path: `${OUT}/admin-${BROWSER}-${width}.png` });
    // Full navigation creates a direct router entry (idx=0) even though the
    // tab has older history entries. Back must remain inside the admin area.
    await page.goto(`${BASE}/admin/categories`);
    await page.getByRole('button', { name: /Electrical/ }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForURL(`${BASE}/admin`);
    check(`${width}: a direct admin link with older browser entries returns to /admin`, new URL(page.url()).pathname === '/admin');
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${OUT}/failure.html`, await activePage.content()).catch(() => {});
    console.error('Admin fixture failure diagnostic', JSON.stringify({ url: activePage.url(), worker: await activePage.evaluate(() => navigator.serviceWorker?.controller?.scriptURL || null), body: (await activePage.locator('body').innerText()).slice(0, 12000), scrollTrace, apiCalls }, null, 2));
  }
  throw error;
} finally {
  await browser.close();
  await writeFile(`${OUT}/admin-${BROWSER}-checks.json`, JSON.stringify(checks, null, 2));
  await writeFile(`${OUT}/api-calls.json`, JSON.stringify(apiCalls, null, 2));
}
if (checks.some(check => !check.ok)) process.exitCode = 1;
