// AYK-496: a provider's home board (my profession / my area), the opportunities page (tabs, selects, pages) and the
// «who may be contacted» rule, in the browser on three screen sizes, against the API and the database.
import { fixtures, connect, check, summary, saveReport, api, qs, sameSet } from './lib.mjs';
import { wanted, openAs, goto, settle, requestIdsIn, close } from './lib-ui.mjs';

const sql = await connect();
const categories = fixtures.categories;
// providers with different coverage shapes
const providers = [fixtures.providers[1], fixtures.providers[0], fixtures.providers[2], fixtures.providers[12]]; // 0 and 2 are «power» providers: whole city, three professions, several pages

for (const viewport of wanted) {
  for (const provider of providers) {
    const page = await openAs({ token: provider.token, viewport });
    await goto(page, '/');
    await page.getByTestId('home-filters').first().waitFor({ timeout: 30000 });
    await settle(page);
    const state = { prof: false, area: false };
    const setBox = async (key, on) => { if (state[key] !== on) { await page.getByTestId(`home-filter-${key}`).click(); state[key] = on; } };
    // the starting state of the checkboxes comes from the account; read it
    for (const key of ['prof', 'area']) state[key] = (await page.getByTestId(`home-filter-${key}`).getAttribute('aria-checked')) === 'true';
    for (const combo of [{ prof: false, area: false }, { prof: true, area: false }, { prof: false, area: true }, { prof: true, area: true }, { prof: false, area: false }]) {
      await setBox('prof', combo.prof); await setBox('area', combo.area);
      // right after the click nothing that breaks the chosen filters may be on screen, even before the server answers
      const wantAll = await api(`/requests/nearby?${qs({ board: 1, matching: 1, limit: 50, f_prof: combo.prof ? 1 : undefined, f_area: combo.area ? 1 : undefined })}`, { token: provider.token });
      await settle(page);
      const shown = await requestIdsIn(page, '[data-testid="work-requests"]');
      const want = (wantAll.data || []).map(r => Number(r.id));
      const fallback = await page.getByTestId('board-fallback').count();
      check(`UI provider ${provider.id} ${viewport} board prof=${combo.prof} area=${combo.area}: what is shown is the server's list`, JSON.stringify(shown) === JSON.stringify(want), `shown ${shown.length} want ${want.length} fallback=${fallback}`);
    }
    // the same fast toggling: many clicks in a row must end on the last state, showing its list
    for (let i = 0; i < 7; i += 1) { await page.getByTestId('home-filter-prof').click(); state.prof = !state.prof; }
    await settle(page, 600);
    const wantFast = (await api(`/requests/nearby?${qs({ board: 1, matching: 1, limit: 50, f_prof: state.prof ? 1 : undefined, f_area: state.area ? 1 : undefined })}`, { token: provider.token })).data.map(r => Number(r.id));
    const shownFast = await requestIdsIn(page, '[data-testid="work-requests"]');
    check(`UI provider ${provider.id} ${viewport}: seven quick clicks end on the last state`, JSON.stringify(shownFast) === JSON.stringify(wantFast), `shown ${shownFast.length} want ${wantFast.length}`);
    check(`UI provider ${provider.id} ${viewport}: no page errors on the home`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));

    // ---- the opportunities page ----
    await goto(page, '/opportunities');
    await page.getByTestId('browse-matching').waitFor({ timeout: 30000 }); await settle(page);
    const pageIds = async () => requestIdsIn(page, 'body');
    // matching tab: pages follow the API, no repeats across pages
    const seen = []; let pages = 0;
    for (;;) {
      const shown = await pageIds(); seen.push(...shown); pages += 1;
      const next = page.getByRole('button', { name: '›' });
      if (await next.isDisabled() || pages >= 8) break;
      await next.click(); await settle(page);
    }
    const wantMatching = (await api(`/requests/nearby?${qs({ matching: 1, limit: 20, page: 1 })}`, { token: provider.token }));
    const total = Number(wantMatching.meta?.pagination?.total || 0);
    check(`UI provider ${provider.id} ${viewport} /opportunities (matching): pages show no request twice`, new Set(seen).size === seen.length, `${seen.length} shown, ${new Set(seen).size} distinct`);
    check(`UI provider ${provider.id} ${viewport} /opportunities (matching): all pages together = the server's total (${total})`, pages >= 8 ? seen.length >= 20 * 7 : seen.length === total, `${seen.length} vs ${total} in ${pages} pages`);
    // the counter above the list is the number of requests, not the size of the page
    const counterBox = page.locator('div.text-secondary').filter({ hasText: /^\s*\d+\s*$/ });
    const counter = (await counterBox.count()) ? Number((await counterBox.first().innerText()).trim()) : -1;
    check(`UI provider ${provider.id} ${viewport} /opportunities: the counter shows the real total`, counter === total, `counter ${counter} total ${total} pages ${pages}`);
    // all tab: the three selects; a hidden filter must not narrow the matching tab
    await page.getByTestId('browse-all').click(); await settle(page);
    const selects = page.locator('.filters select');
    await selects.nth(0).selectOption(String(categories[1])); await settle(page);
    const wantAllCat = (await api(`/requests/nearby?${qs({ category_id: categories[1], limit: 20 })}`, { token: provider.token })).data.map(r => Number(r.id));
    check(`UI provider ${provider.id} ${viewport} /opportunities (all) profession only`, JSON.stringify(await pageIds()) === JSON.stringify(wantAllCat), `shown ${(await pageIds()).length} want ${wantAllCat.length}`);
    await selects.nth(2).selectOption(String(fixtures.cities[1])); await settle(page);
    const wantAllCatCity = (await api(`/requests/nearby?${qs({ category_id: categories[1], city_id: fixtures.cities[1], limit: 20 })}`, { token: provider.token })).data.map(r => Number(r.id));
    check(`UI provider ${provider.id} ${viewport} /opportunities (all) profession + city`, JSON.stringify(await pageIds()) === JSON.stringify(wantAllCatCity), `shown ${(await pageIds()).length} want ${wantAllCatCity.length}`);
    await page.getByTestId('browse-matching').click(); await settle(page);
    const wantBack = (await api(`/requests/nearby?${qs({ matching: 1, limit: 20 })}`, { token: provider.token })).data.map(r => Number(r.id));
    check(`UI provider ${provider.id} ${viewport} /opportunities: back on «my profession and area» the old choices no longer narrow it`, JSON.stringify(await pageIds()) === JSON.stringify(wantBack), `shown ${(await pageIds()).length} want ${wantBack.length}`);
    check(`UI provider ${provider.id} ${viewport}: no page errors on /opportunities`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
}

// ---- who may be contacted: buttons only for a provider of the request's profession, inside his coverage ----
{
  const provider = fixtures.providers[1];
  const rows = (await api('/requests/nearby?matching=1&scope=all&limit=100', { token: provider.token })).data.concat((await api('/requests/nearby?limit=100', { token: provider.token })).data);
  let fits = null, notFits = null;
  for (const row of rows) {
    const r = await api(`/requests/${row.id}`, { token: provider.token });
    if (r.data?.can_contact === true && !fits) fits = row.id; if (r.data?.can_contact === false && !notFits) notFits = row.id;
    if (fits && notFits) break;
  }
  check('UI contact: the seed has both kinds of request for this provider', Boolean(fits && notFits), `fits=${fits} notFits=${notFits}`);
  for (const viewport of wanted) {
    const page = await openAs({ token: provider.token, viewport });
    for (const [id, should] of [[fits, true], [notFits, false]]) {
      if (!id) continue;
      await goto(page, `/requests/${id}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800);
      const buttons = await page.getByTestId('provider-contact').count();
      check(`UI contact ${viewport} request ${id}: contact buttons ${should ? 'shown' : 'absent'}`, (buttons > 0) === should, `buttons=${buttons}`);
    }
    await page.context().close();
  }
}

const bad = summary('UI provider');
saveReport('ui-provider');
await close(); await sql.end();
process.exit(bad.length ? 1 : 0);
