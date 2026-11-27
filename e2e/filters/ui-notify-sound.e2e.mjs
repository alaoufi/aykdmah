// AYK-511 (the owner: «هل موجود مع الإشعار تنبيه صوتي؟ وتأكد من فاعليته»): a notification that arrives while the site is
// open must play the site's tone (three notes) and show its banner. The browser's audio is replaced by a counter of the
// notes really started, so the test proves the sound is produced, not just that code exists. A real notification is made
// the real way: a provider sends an offer on the signed-in client's request.
import { fixtures, connect, check, summary, saveReport, api } from './lib.mjs';
import { openAs, goto, settle, close } from './lib-ui.mjs';

const sql = await connect();
const client = fixtures.clients[2];
const request = (await sql(`SELECT id FROM requests WHERE client_id = $1 AND status = 'open' AND deleted_at IS NULL ORDER BY id LIMIT 1`, [client.id]))[0];
check('a client with an open request exists for the sound test', Boolean(request), `client ${client.id}`);

if (request) {
  const page = await openAs({ token: client.token, viewport: 'mobile' });
  await page.addInitScript(() => {
    window.__notes = 0; window.__ctxStates = [];
    const Real = window.AudioContext || window.webkitAudioContext;
    if (!Real) return;
    const original = Real.prototype.createOscillator;
    Real.prototype.createOscillator = function patched(...args) {
      const osc = original.apply(this, args);
      const start = osc.start.bind(osc);
      osc.start = (...a) => { window.__notes += 1; window.__ctxStates.push(this.state); return start(...a); };
      return osc;
    };
  });
  await goto(page, '/'); await page.getByTestId('requester-home').waitFor({ timeout: 30000 }); await settle(page);
  await page.mouse.click(30, 300); // the first tap makes the browser's audio ready, as a real person's does
  await page.waitForTimeout(4000); // the live connection is up
  const before = await page.evaluate(() => window.__notes);

  let sent = null;
  for (const provider of fixtures.providers.slice(0, 40)) {
    const r = await api('/offers', { token: provider.token, method: 'POST', body: { request_id: request.id, price: 150, message: 'sound test' } });
    if (r.status === 201) { sent = provider; break; }
  }
  check('an offer could be sent to make a real notification', Boolean(sent), 'no provider could send one');

  if (sent) {
    await page.waitForFunction(b => window.__notes >= b + 3, before, { timeout: 15000 }).catch(() => {});
    const notes = (await page.evaluate(() => window.__notes)) - before;
    const states = await page.evaluate(() => window.__ctxStates.slice(-3));
    check('a notification that arrives in the open site plays the three-note tone', notes >= 3, `notes ${notes}`);
    check('the tone is played on a running audio engine (not a suspended one)', states.length === 3 && states.every(s => s === 'running'), states.join(','));
    const unread = await api('/notifications?limit=5', { token: client.token });
    check('the notification exists for the client (unread)', (unread.data || []).some(n => !n.is_read && n.type === 'new_offer'), JSON.stringify((unread.data || []).map(n => n.type)));
  }
  check('no page errors', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  await page.context().close();
}
await close(); await sql.end();
saveReport('ui-notify-sound');
process.exit(summary('Notification sound').length ? 1 : 0);
