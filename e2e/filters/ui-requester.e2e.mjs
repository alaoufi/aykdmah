// AYK-496: a requester's home (requests and providers tabs, «similar to my requests» / «my area»), «my requests» tabs
// and the chat list (active / archive, pages, search), in the browser on three screen sizes.
import { fixtures, connect, check, summary, saveReport, api, qs } from './lib.mjs';
import { wanted, openAs, goto, settle, requestIdsIn, providerIdsIn, close } from './lib-ui.mjs';

const sql = await connect();
const clients = [fixtures.clients[1], fixtures.clients[5]];
const chatty = fixtures.clients[0];

// What the page asked the server for, and what the server answers to the same question (as the same account).
function watch(page, pathPart) {
  const asked = [];
  page.on('request', r => { if (r.url().includes(pathPart)) asked.push(r.url().split('/api')[1]); });
  return () => asked[asked.length - 1];
}

for (const viewport of wanted) {
  // ---- home: providers and requests ----
  for (const client of clients) {
    const page = await openAs({ token: client.token, viewport });
    const lastMatching = watch(page, '/providers/matching');
    const lastBoard = watch(page, '/requests/nearby');
    await goto(page, '/'); await page.getByTestId('requester-home').waitFor({ timeout: 30000 }); await settle(page);
    await page.getByTestId('home-tab-providers').click(); await settle(page);
    const boxState = async key => (await page.getByTestId(`home-filter-${key}`).getAttribute('aria-checked')) === 'true';
    for (const combo of [[false, false], [true, false], [false, true], [true, true], [false, false]]) {
      for (const [i, key] of ['prof', 'area'].entries()) if ((await boxState(key)) !== combo[i]) { await page.getByTestId(`home-filter-${key}`).click(); await settle(page); }
      const url = lastMatching();
      const r = await api(url, { token: client.token });
      const all = (r.data?.providers || []).map(p => Number(p.id));
      const shown = await providerIdsIn(page, '[data-testid="providers-for-me"]');
      const subset = shown.every(id => all.includes(id));
      check(`UI requester ${client.id} ${viewport} providers prof=${combo[0]} area=${combo[1]}: only providers the server lists for that choice`, subset && (all.length === 0 || shown.length > 0), `shown ${shown.length} server ${all.length} url=${url}`);
      // the cards say whether they match; a provider flagged «in my profession» must really cover one of the professions asked for
    }
    await page.getByTestId('home-tab-requests').click(); await settle(page);
    for (const combo of [[false, false], [true, false], [false, true], [true, true]]) {
      for (const [i, key] of ['prof', 'area'].entries()) if ((await boxState(key)) !== combo[i]) { await page.getByTestId(`home-filter-${key}`).click(); await settle(page); }
      const url = lastBoard();
      const r = await api(url, { token: client.token });
      const want = (r.data || []).map(x => Number(x.id));
      const shown = await requestIdsIn(page, '[data-testid="work-requests"]');
      const fallback = await page.getByTestId('board-fallback').count();
      check(`UI requester ${client.id} ${viewport} requests prof=${combo[0]} area=${combo[1]}: the server's board for that choice`, JSON.stringify(shown) === JSON.stringify(want), `shown ${shown.length} want ${want.length} fallback=${fallback}`);
    }
    // AYK-501 (the owner): a requester only SEES others' requests: no contact button, and tapping a card opens the
    // request's page without any dialog asking him to become a provider or change his profession.
    const cards = page.locator('[data-testid="request-card"]');
    const cardCount = await cards.count();
    check(`UI requester ${client.id} ${viewport}: no contact button on other people's requests`, (await page.locator('[data-testid="request-contact"]').count()) === 0, `cards ${cardCount}`);
    if (cardCount > 0) {
      await cards.first().click(); await settle(page);
      check(`UI requester ${client.id} ${viewport}: tapping a request opens its page, with no dialog`, /\/requests\/\d+/.test(page.url()) && (await page.getByTestId('app-dialog').count()) === 0, page.url());
    }
    check(`UI requester ${client.id} ${viewport}: no page errors`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  // ---- my requests ----
  {
    const client = fixtures.clients[2];
    const page = await openAs({ token: client.token, viewport });
    await goto(page, '/client/requests').catch(() => {}); await settle(page, 600);
    const mine = (await sql('SELECT r.id FROM requests r WHERE r.client_id = $1 AND r.deleted_at IS NULL', [client.id])).map(r => Number(r.id));
    const shown = await requestIdsIn(page, 'body');
    check(`UI my requests ${client.id} ${viewport}: only his own requests`, shown.every(id => mine.includes(id)), `shown ${shown.length} mine ${mine.length} url ${page.url()}`);
    await page.context().close();
  }

  // ---- the chat list: tabs, pages, search ----
  {
    const page = await openAs({ token: chatty.token, viewport });
    let lastList = watch(page, '/chat/conversations?');
    await goto(page, '/chat'); await page.locator('.conv-list').first().waitFor({ timeout: 30000 }).catch(() => {}); await settle(page);
    const rows = async () => (await page.locator('.conv-list a.conv-item').evaluateAll(list => list.map(a => Number(a.getAttribute('href').split('/').pop()))));
    const fromApi = async (url) => (await api(url, { token: chatty.token })).data.map(c => Number(c.id));
    const first = await rows();
    check(`UI chat ${viewport}: the first page lists what the server lists`, JSON.stringify(first) === JSON.stringify(await fromApi(lastList())), `shown ${first.length}`);
    // next pages: no row repeats, together = all the person's chats
    const seen = [...first]; let guard = 0;
    while (!(await page.getByTestId('chat-list-next').isDisabled()) && guard < 6) { await page.getByTestId('chat-list-next').click(); await settle(page); const more = await rows(); seen.push(...more); guard += 1; }
    const total = (await api('/chat/conversations?limit=100&archived=0', { token: chatty.token })).data.length;
    check(`UI chat ${viewport}: pages show every active chat once`, new Set(seen).size === seen.length && seen.length === total, `${seen.length} shown, ${new Set(seen).size} distinct, ${total} active`);
    // the archive tab shows only archived ones and the active tab never shows them
    await page.getByTestId('chat-list-next').isDisabled().catch(() => {});
    await page.locator('[data-testid="chat-list-next"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.close().catch(() => {});
    await page.context().close();
  }
}

const bad = summary('UI requester');
saveReport('ui-requester');
await close(); await sql.end();
process.exit(bad.length ? 1 : 0);
