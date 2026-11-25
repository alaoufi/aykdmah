// AYK-496: the visitor's home (several regions and professions), in the browser on three screen sizes.
import { fixtures, connect, check, summary, saveReport, api, sameSet, diff, qs } from './lib.mjs';
import { wanted, openAs, goto, settle, requestIdsIn, providerIdsIn, close } from './lib-ui.mjs';

const sql = await connect();
const regionOfCity = Object.fromEntries((await sql('SELECT c.id, COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id')).map(r => [Number(r.id), Number(r.region_id)]));
const regions = [...new Set(fixtures.cities.map(c => regionOfCity[c]))];
const categories = fixtures.categories;

for (const viewport of wanted) {
  const page = await openAs({ viewport });
  await goto(page, '/');
  await page.getByTestId('guest-home').waitFor({ timeout: 30000 });
  const pick = async (testId, values) => {
    // open, untick everything ticked, tick the wanted ones, close
    await page.getByTestId(testId).click();
    const panel = page.getByTestId(`${testId}-panel`);
    if (await page.getByTestId(`${testId}-clear`).count()) await page.getByTestId(`${testId}-clear`).click();
    for (const v of values) await panel.getByTestId(`${testId}-opt-${v}`).click();
    await page.getByTestId(`${testId}-done`).click();
  };
  const combos = [
    { regs: [], cats: [] }, { regs: [regions[0]], cats: [] }, { regs: [], cats: [categories[0]] }, { regs: [regions[0]], cats: [categories[0]] },
    { regs: regions.slice(0, 2), cats: categories.slice(0, 2) }, { regs: [regions[2]], cats: [categories[3], categories[4]] }, { regs: regions, cats: categories.slice(0, 5) },
  ];
  for (const tab of ['requests', 'providers']) {
    await page.getByTestId(`guest-tab-${tab}`).click();
    for (const combo of combos) {
      await pick('guest-region', combo.regs.map(String));
      await pick('guest-category', combo.cats.map(String));
      await settle(page);
      const label = `${viewport} ${tab} regions=[${combo.regs}] professions=[${combo.cats}]`;
      if (tab === 'requests') {
        const api10 = await api(`/requests/nearby?${qs({ limit: 10, status: 'open', category_ids: combo.cats.join(','), region_ids: combo.regs.join(',') })}`);
        const want = (api10.data || []).map(r => Number(r.id));
        const shown = await requestIdsIn(page, '[data-testid="guest-requests"]');
        const none = await page.getByTestId('guest-none').count();
        check(`UI guest ${label}: the cards are the first ten of that choice`, JSON.stringify(shown) === JSON.stringify(want) && (want.length === 0 ? none === 1 : none === 0), `shown ${shown.length} want ${want.length} none=${none}`);
      } else {
        const r = await api(`/providers/matching?${qs({ scope: 'all', category_ids: combo.cats.join(','), region_ids: combo.regs.join(',') })}`);
        const all = (r.data?.providers || []).map(p => Number(p.id));
        const shown = await providerIdsIn(page, '[data-testid="guest-providers"]');
        const none = await page.getByTestId('guest-none').count();
        check(`UI guest ${label}: the first eight providers of that choice`, shown.length === Math.min(8, all.length) && shown.every(id => all.includes(id)) && (all.length === 0 ? none === 1 : none === 0), `shown ${shown.length} of ${all.length} none=${none}`);
        if (all.length > 8) {
          await page.getByTestId('guest-providers-more').click(); await settle(page);
          const more = await providerIdsIn(page, '[data-testid="guest-providers"]');
          check(`UI guest ${label}: «show more» lists them all (up to 100)`, more.length === Math.min(100, all.length) && more.every(id => all.includes(id)), `shown ${more.length} of ${all.length}`);
          await page.reload(); await page.getByTestId('guest-home').waitFor(); await page.getByTestId(`guest-tab-${tab}`).click();
        }
      }
    }
    // the «show all» button returns to everything
    await pick('guest-region', [String(regions[1])]); await pick('guest-category', [String(categories[7])]); await settle(page);
    if (await page.getByTestId('guest-show-all').count()) {
      await page.getByTestId('guest-show-all').click(); await settle(page);
      const lab = await page.getByTestId('guest-region').innerText();
      check(`UI guest ${viewport} ${tab}: «show all» clears both choices`, !/\+\d/.test(lab) && await page.getByTestId('guest-none').count() === 0, lab);
    }
  }

  // Fast changes with slow answers arriving out of order: the screen must end on the LAST choice.
  await page.getByTestId('guest-tab-requests').click();
  let calls = 0;
  await page.route('**/api/requests/nearby**', async route => {
    const url = route.request().url(); calls += 1;
    if (url.includes(`region_ids=${regions[0]}`) && !url.includes(',')) await new Promise(r => setTimeout(r, 2500)); // the first choice answers last
    await route.continue();
  });
  await pick('guest-category', []); await pick('guest-region', []); await settle(page);
  await pick('guest-region', [String(regions[0])]);          // slow answer
  await pick('guest-region', [String(regions[1])]);          // quick answer, newer
  await page.waitForTimeout(3500); await settle(page);
  const wantLast = (await api(`/requests/nearby?${qs({ limit: 10, status: 'open', region_ids: regions[1] })}`)).data.map(r => Number(r.id));
  const shownLast = await requestIdsIn(page, '[data-testid="guest-requests"]');
  check(`UI guest ${viewport}: after quick changes with a slow older answer, the last choice is what is shown`, JSON.stringify(shownLast) === JSON.stringify(wantLast), `shown ${shownLast} want ${wantLast}`);
  await page.unroute('**/api/requests/nearby**');
  check(`UI guest ${viewport}: no page errors`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  await page.context().close();
}

const bad = summary('UI guest');
saveReport('ui-guest');
await close(); await sql.end();
process.exit(bad.length ? 1 : 0);
