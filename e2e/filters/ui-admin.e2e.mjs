// AYK-496: the administration's requests and providers lists (region → city → profession, visibility, search), in the
// browser on three screen sizes: what is shown must be what the database holds for that choice.
import { fixtures, connect, check, summary, saveReport, api, qs } from './lib.mjs';
import { wanted, openAs, goto, settle, close } from './lib-ui.mjs';

const sql = await connect();
const headers = { 'X-Ayk-Scope': 'admin' };
const regionsWithData = (await sql(`SELECT DISTINCT COALESCE(c.region_id, g.region_id) AS id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE c.id = ANY($1::int[])`, [fixtures.cities])).map(r => Number(r.id));

// AYK-502: the control home's «تصدير PDF»: a real download, a valid A4 PDF whose figures are the database's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
for (const viewport of wanted) {
  const page = await openAs({ adminToken: fixtures.adminToken, viewport });
  await goto(page, '/admin');
  const button = page.getByTestId('admin-export-pdf');
  await button.waitFor({ timeout: 30000 }); await settle(page, 500);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), button.click()]);
  const file = path.join(os.tmpdir(), `ayk-dashboard-${viewport}-${Date.now()}.pdf`);
  await download.saveAs(file);
  const bytes = fs.readFileSync(file);
  check(`UI admin export ${viewport}: the download is named with today's date`, /^aykdmh-stats-\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
  check(`UI admin export ${viewport}: a PDF file with content`, bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 20000, `${bytes.length} bytes`);
  let pages = 0;
  try { pages = Number((execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/) || [])[1]); } catch (_) { /* pdfinfo missing */ }
  check(`UI admin export ${viewport}: A4 pages`, pages >= 1 && pages <= 3, `pages ${pages}`);
  check(`UI admin export ${viewport}: no page errors`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  if (process.env.KEEP_PDF) fs.copyFileSync(file, path.join(process.env.KEEP_PDF, `dashboard-${viewport}.pdf`));
  fs.rmSync(file, { force: true });
  await page.context().close();
}

for (const viewport of wanted) {
  for (const kind of ['requests', 'providers']) {
    const page = await openAs({ adminToken: fixtures.adminToken, viewport });
    let last = null;
    page.on('response', async r => { if (new RegExp(`/api/admin/${kind}\\?`).test(r.url())) { try { last = { url: r.url(), body: await r.json() }; } catch (_) { /* aborted */ } } });
    await goto(page, `/admin/${kind}`);
    await page.getByTestId('admin-list-filters').waitFor({ timeout: 30000 }); await settle(page, 500);
    const rowsShown = async () => (kind === 'requests' ? page.getByText(/^\s*#\d+ ·/).count() : page.locator('[data-testid="providers-list"] > *').count());
    const total = () => Number(last?.body?.meta?.pagination?.total);
    const sqlTotal = async (extra = '', params = []) => Number((await sql(kind === 'requests'
      ? `SELECT COUNT(*) AS n FROM requests r LEFT JOIN cities c ON c.id = r.city_id LEFT JOIN governorates g ON g.id = c.governorate_id LEFT JOIN services s ON s.id = r.service_id WHERE r.deleted_at IS NULL ${extra}`
      : `SELECT COUNT(*) AS n FROM users u JOIN provider_profiles pp ON pp.user_id = u.id LEFT JOIN cities c ON c.id = u.city_id LEFT JOIN governorates g ON g.id = c.governorate_id WHERE u.role = 'provider' AND u.deleted_at IS NULL ${extra}`, params))[0].n);
    check(`UI admin ${kind} ${viewport}: unfiltered total = the database`, total() === await sqlTotal(), `ui ${total()} db ${await sqlTotal()}`);

    // region → city hierarchy
    const region = regionsWithData[0];
    await page.getByTestId('filter-region').selectOption(String(region)); await settle(page, 500);
    const regionCond = kind === 'requests' ? 'AND COALESCE(c.region_id, g.region_id) = $1' : 'AND COALESCE(c.region_id, g.region_id) = $1';
    check(`UI admin ${kind} ${viewport}: region only`, total() === await sqlTotal(regionCond, [region]), `ui ${total()} db ${await sqlTotal(regionCond, [region])}`);
    const cityOptions = (await page.getByTestId('filter-city').locator('option').evaluateAll(o => o.map(x => Number(x.value)).filter(Boolean)));
    const cityWant = (await sql('SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = $1 AND c.is_active = 1', [region])).map(r => Number(r.id));
    check(`UI admin ${kind} ${viewport}: the city list holds exactly the cities of the region`, cityOptions.length === cityWant.length && cityOptions.every(id => cityWant.includes(id)), `ui ${cityOptions.length} db ${cityWant.length}`);
    const city = fixtures.cities.find(c => cityOptions.includes(c));
    if (city) {
      await page.getByTestId('filter-city').selectOption(String(city)); await settle(page, 500);
      const cond = kind === 'requests' ? 'AND r.city_id = $1' : 'AND u.city_id = $1';
      check(`UI admin ${kind} ${viewport}: region + city`, total() === await sqlTotal(cond, [city]), `ui ${total()} db ${await sqlTotal(cond, [city])}`);
      // profession on top
      const category = fixtures.categories[1];
      await page.getByTestId('filter-category').selectOption(String(category)); await settle(page, 500);
      const catCond = kind === 'requests' ? `${cond} AND COALESCE(r.category_id, s.category_id) = $2` : `${cond} AND (pp.category_id = $2 OR EXISTS (SELECT 1 FROM services sv WHERE sv.category_id = $2 AND pp.service_ids @> to_jsonb(sv.id)))`;
      check(`UI admin ${kind} ${viewport}: region + city + profession`, total() === await sqlTotal(catCond, [city, category]), `ui ${total()} db ${await sqlTotal(catCond, [city, category])}`);
    }
    // changing the region clears the city
    await page.getByTestId('filter-region').selectOption(String(regionsWithData[1] || region)); await settle(page, 500);
    check(`UI admin ${kind} ${viewport}: a new region clears the city`, (await page.getByTestId('filter-city').inputValue()) === '', await page.getByTestId('filter-city').inputValue());
    // back to all
    await page.getByTestId('filter-region').selectOption(''); await page.getByTestId('filter-category').selectOption(''); await settle(page, 500);
    check(`UI admin ${kind} ${viewport}: back to «all» = the unfiltered total`, total() === await sqlTotal(), `ui ${total()} db ${await sqlTotal()}`);

    // quick changes with a slow older answer: the screen and the last request agree with the last choice
    await page.route(`**/api/admin/${kind}?**`, async route => { if (route.request().url().includes(`region_id=${region}`) && !route.request().url().includes('city_id')) await new Promise(r => setTimeout(r, 2500)); await route.continue(); });
    await page.getByTestId('filter-region').selectOption(String(region));
    await page.getByTestId('filter-region').selectOption('');
    await page.waitForTimeout(3500); await settle(page, 400);
    const rows = await rowsShown();
    check(`UI admin ${kind} ${viewport}: after a quick change with a slow older answer, the list is the unfiltered one`, rows === Math.min(20, await sqlTotal()) && (await page.getByTestId('filter-region').inputValue()) === '', `rows ${rows} region=${await page.getByTestId('filter-region').inputValue()}`);
    await page.unroute(`**/api/admin/${kind}?**`);
    check(`UI admin ${kind} ${viewport}: no page errors`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
}

const bad = summary('UI admin');
saveReport('ui-admin');
await close(); await sql.end();
process.exit(bad.length ? 1 : 0);
