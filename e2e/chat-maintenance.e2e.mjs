// Browser contracts with synthetic API fixtures only. No real accounts, DB writes,
// provider APIs or external network. Run against the disposable app build.
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { BASE, BROWSER = 'chromium', OUT = '/out' } = process.env;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost|ayk-shots-\d+-app)(?::\d+)?$/.test(BASE || '')) throw Error('Use a local/disposable HTTP app only');
const engine = BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const fixtures = JSON.parse(await readFile(new URL('../server/tests/fixtures/chat-media.json', import.meta.url), 'utf8'));
const locales = Object.fromEntries(await Promise.all(['en', 'ar'].map(async lang => [lang, JSON.parse(await readFile(new URL(`../client/src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'))])));
const checks = [];
const check = (name, ok) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw Error(name); };
await mkdir(OUT, { recursive: true });
try {
  for (const { width, lang } of [{ width: 280, lang: 'ar' }, { width: 320, lang: 'ar' }, { width: 390, lang: 'en' }, { width: 768, lang: 'en' }]) {
    const prefix = `${BROWSER}/${lang}/${width}`;
    const t = key => key.split('.').reduce((value, part) => value?.[part], locales[lang]);
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: lang, bypassCSP: true, serviceWorkers: 'block' });
    await context.addInitScript(({ lang }) => {
      localStorage.setItem('lsm_token', 'synthetic-client'); localStorage.setItem('lsm_lang', lang);
      if (!localStorage.getItem('aykdmh_chat_prefs')) localStorage.setItem('aykdmh_chat_prefs', JSON.stringify({ size: 'm', bold: false, translate: false }));
    }, { lang });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let role = 'client', contactWrites = [], uploads = [], forwardBodies = [], matchingReads = [], requestReads = [], failForward = false, partialForward = false, abortForward = false, delayForward = false, releaseForward, forwardStarted;
    const own = () => ({ id: 1, full_name: 'Synthetic owner', role, is_active: 1, city_id: 9, district_id: 19, must_change_password: 0, phone: '+966500000001', is_verified: 1 });
    const peer = () => ({ id: 2, full_name: role === 'provider' ? 'Requester' : 'Synthetic provider', role: role === 'provider' ? 'client' : 'provider', referral_code: 'AB12', is_online: false });
    const conversation = id => ({ id, request_id: 77, request_title: 'Synthetic service request', request_status: 'open', request_client_id: role === 'provider' ? 2 : 1, can_send: true, can_share_location: false, other_user: { ...peer(), full_name: id === 34 ? 'Older peer' : peer().full_name }, participants: [own(), peer()], is_favorite: 0, unread_count: 0, last_message: { content: 'Recent message', message_type: 'text', created_at: '2026-11-04T10:00:00Z' } });
    const requestRow = { id: 77, client_id: 2, status: 'open', category_id: 5, category_name: 'Electrical', category_name_en: 'Electrical', title: 'Synthetic service request', description: 'Public request description', city_id: 9, district_id: 19, client_rating_avg: 4.4, client_rating_count: 8, client_opinion: 'Clear requester communication', created_at: '2026-11-04T10:00:00Z', files: [] };
    const voiceUrl = '/api/media/12345678-1234-4234-8234-123456789012';
    const initial = [
      { id: 101, conversation_id: 10, sender_id: 1, sender_name: 'Synthetic owner', message_type: 'text', content: 'First own message', created_at: '2026-11-04T10:00:00Z', is_read: 1, files: [] },
      { id: 102, conversation_id: 10, sender_id: 1, sender_name: 'Synthetic owner', message_type: 'voice', created_at: '2026-11-04T10:01:00Z', is_read: 1, files: [{ id: 1, file_url: voiceUrl, file_name: 'voice.m4a', file_type: 'audio/mp4', duration_seconds: 600 }] },
      { id: 103, conversation_id: 10, sender_id: 2, sender_name: 'Synthetic peer', message_type: 'text', content: 'A received message', created_at: '2026-11-04T10:02:00Z', is_read: 1, files: [] },
    ];
    let sentMessages = [...initial];
    // The normal production build uses Socket.IO. This local Engine.IO fixture
    // makes its connection real to the browser without connecting to an app server.
    if (page.routeWebSocket) await page.routeWebSocket('**/socket.io/**', socket => {
      socket.send('0{"sid":"synthetic","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
      socket.onMessage(message => { if (String(message).startsWith('40')) socket.send('40{"sid":"synthetic-socket"}'); if (message === '2') socket.send('3'); });
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(BASE).origin) return route.abort();
      if (engine === webkit && route.request().resourceType() === 'document') {
        const response = await route.fetch(), headers = response.headers();
        if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].split(';').filter(value => value.trim() !== 'upgrade-insecure-requests').join(';');
        return route.fulfill({ response, headers });
      }
      return route.fallback();
    });
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname.replace(/^\/api/, '');
      let data = [], meta;
      if (method === 'POST' && (['/chat/conversations','/requests','/requests/direct'].includes(path) || /^\/requests\/\d+\/contact$/.test(path))) contactWrites.push({path,body:req.postDataJSON()});
      if (url.searchParams.get('q') === 'fail-search') return route.fulfill({status:400,json:{success:false,message:'Synthetic field error'}});
      if (path.startsWith('/media/')) return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from(fixtures['voice.m4a'], 'base64') });
      if (path === '/auth/me') data = { user: own(), provider: role === 'provider' ? { category_id: 5, service_ids: [11], availability_status: 'available' } : null };
      else if (path === '/settings/public') data = { subscriptions_enabled: false };
      else if (path === '/categories') data = [{ id: 5, name_ar: 'الكهرباء', name_en: 'Electrical', slug: 'electrical' }];
      else if (path === '/services') data = [{ id: 11, category_id: 5, name_ar: 'خدمة تجريبية', name_en: 'Synthetic service' }];
      else if (path === '/cities') data = [{ id: 9, name_ar: 'مدينة تجريبية', name_en: 'Synthetic city' }];
      else if (path === '/providers/matching') {
        matchingReads.push(url.searchParams.get('matching'));
        const p = { id: 2, full_name: 'Synthetic provider', category_id: 5, category_name_ar: 'الكهرباء', category_name_en: 'Electrical', rating_avg: 4.9, rating_count: 12, opinion: 'Careful reliable service', service_ids: [11], availability: { state: 'available' } };
        data = { area: { city_id: 9, district_id: 19, city_name_ar: 'مدينة تجريبية', city_name_en: 'Synthetic city' }, requested_category_ids: [5], providers: url.searchParams.get('matching') === '1' ? [p] : [p, { ...p, id: 3, full_name: 'Other profession provider' }] };
      } else if (path === '/requests/nearby') {
        requestReads.push(Object.fromEntries(url.searchParams)); data = [requestRow]; meta = { pagination: { hasNext: false } };
      } else if (path === '/requests/77') data = { ...requestRow, client_id: role === 'provider' ? 2 : 1 };
      else if (/^\/reviews\/user\/\d+$/.test(path)) data = [{ id: 1, rating: 5, comment: 'Public opinion content' }];
      else if (path === '/chat/conversations' && method === 'GET') {
        let rows = Array.from({ length: 25 }, (_, i) => conversation(10 + i));
        const q = url.searchParams.get('q'); if (q) rows = rows.filter(row => row.other_user.full_name.toLowerCase().includes(q.toLowerCase()));
        const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
        data = rows.slice((page - 1) * limit, page * limit);
      } else if (/^\/chat\/conversations\/\d+\/search$/.test(path)) data = url.searchParams.get('q') ? [{ id: 1, content: 'Older needle', sender_name: 'Requester', sender_id: 2, message_type: 'text', created_at: '2026-11-01T10:00:00Z' }] : [];
      else if (/^\/chat\/conversations\/\d+\/messages$/.test(path)) {
        if (method === 'POST') {
          uploads.push(req.postData() || '');
          data = { id: 200 + uploads.length, sender_id: 1, conversation_id: Number(path.split('/')[3]), content: 'Uploaded attachments', message_type: 'file', files: [], created_at: '2026-11-04T10:03:00Z' }; sentMessages.push(data);
        } else data = url.searchParams.has('before') ? [{ id: 1, sender_id: 2, sender_name: 'Requester', content: 'Older needle', message_type: 'text', files: [], created_at: '2026-11-01T10:00:00Z', is_read: 1 }] : sentMessages;
      } else if (/^\/chat\/conversations\/\d+\/forward$/.test(path)) {
        const body = req.postDataJSON(); forwardBodies.push(body); if(delayForward){delayForward=false;forwardStarted?.();await new Promise(resolve=>{releaseForward=resolve;});} if(abortForward){abortForward=false;return route.abort('failed');} if(partialForward){partialForward=false;return route.fulfill({status:200,json:{success:true,data:{count:body.message_ids.length,results:body.conversation_ids.map((id,index)=>({conversation_id:id,count:index===0?body.message_ids.length:0,success:index===0}))}}});} if (failForward) return route.fulfill({status:403,json:{success:false,message:'Synthetic recipient error'}}); data = { count: body.message_ids.length * body.conversation_ids.length, results: body.conversation_ids.map(id => ({ conversation_id: id, count: body.message_ids.length, success: true })) };
      } else if (/^\/chat\/conversations\/\d+$/.test(path)) data = conversation(Number(path.split('/').at(-1)));
      else if (path === '/requests/direct' || path === '/requests/77/contact') { data = { request_id: 77, conversation_id: 90 }; }
      else if (path === '/chat/unread') data = { count: 0 };
      await route.fulfill({ status: method === 'POST' && /\/messages$/.test(path) ? 201 : 200, json: { success: true, data, ...(meta ? { meta } : {}) } });
    });

    await page.goto(`${BASE}/`);
    await page.getByTestId('provider-card').first().waitFor();
    check(`${prefix}: requester defaults to previously requested professions`, matchingReads.includes('1') && await page.getByTestId('provider-card').count() === 1);
    await page.getByTestId('all-professions').click(); await page.getByText('Other profession provider', { exact: true }).waitFor();
    check(`${prefix}: requester can browse all professions`, await page.getByTestId('provider-card').count() === 2);
    await page.getByTestId('trust-summary').first().click(); await page.getByText('Public opinion content', { exact: true }).waitFor();
    check(`${prefix}: card exposes ratings and public opinions without navigation`, await page.getByTestId('trust-dialog').isVisible() && new URL(page.url()).pathname === '/' && contactWrites.length === 0);
    await page.getByTestId('trust-dialog').getByRole('button', { name: t('common.close'), exact: true }).click();
    await page.getByTestId('direct-contact').first().click(); await page.getByTestId('app-dialog').waitFor();
    await page.getByTestId('app-dialog').getByRole('button', { name: t('dialog.cancel'), exact: true }).click();
    check(`${prefix}: cancelling previous-chat choice writes nothing`, contactWrites.length === 0);
    await page.getByTestId('direct-contact').first().click();await page.getByTestId('app-dialog').waitFor();
    await page.evaluate(()=>{history.pushState({key:'away-contact'},'', '/services');dispatchEvent(new PopStateEvent('popstate'));});
    await page.getByTestId('app-dialog').waitFor({state:'detached'});
    await page.evaluate(()=>{history.pushState({key:'returned-contact'},'', '/');dispatchEvent(new PopStateEvent('popstate'));});
    await page.getByTestId('provider-card').first().waitFor();
    check(`${prefix}: leaving and returning invalidates previous-chat approval`, contactWrites.length===0 && await page.getByTestId('app-dialog').count()===0);
    await page.getByTestId('direct-contact').first().click();await page.getByTestId('app-dialog').waitFor();
    await page.evaluate(()=>{localStorage.setItem('lsm_token','synthetic-other-session');dispatchEvent(new Event('ayk:session-change'));});
    await page.getByTestId('app-dialog').waitFor({state:'detached'});
    check(`${prefix}: session change cancels pending previous-chat approval`, contactWrites.length===0);
    await page.evaluate(()=>{localStorage.setItem('lsm_token','synthetic-client');dispatchEvent(new Event('ayk:session-change'));});
    await page.getByTestId('provider-card').first().waitFor();
    await page.getByTestId('direct-contact').first().click();
    await page.getByTestId('app-dialog').getByRole('button', { name: t('chat.new_conversation'), exact: true }).click();
    await page.waitForURL('**/chat/90');
    check(`${prefix}: requester creates a separate scoped conversation`, contactWrites.at(-1)?.body.fresh === true);

    await page.goto(`${BASE}/chat/10`); await page.locator('.voice-note').waitFor();
    const voiceGeometry = await page.locator('.voice-note').evaluate(el => ({ width: el.getBoundingClientRect().width, parent: el.closest('.bubble').getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth + 1 }));
    check(`${prefix}: voice bubble fits its own container`, voiceGeometry.width <= voiceGeometry.parent + 1 && !voiceGeometry.overflow);
    check(`${prefix}: thread has no horizontal scroll`, await page.locator('.chat-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const menu = page.locator('.chat-header').getByTestId('chat-menu');
    await menu.click(); await page.getByTestId('chat-settings-inside').click(); await page.getByTestId('chat-bold').check();
    await page.keyboard.press('Escape');
    check(`${prefix}: bold preference applies to thread`, await page.locator('.content').first().evaluate(el => getComputedStyle(el).fontWeight) === '700');
    await page.reload(); await page.locator('.content').first().waitFor();
    check(`${prefix}: bold survives reload`, await page.locator('.content').first().evaluate(el => getComputedStyle(el).fontWeight) === '700');
    await page.locator('.chat-header').getByTestId('chat-menu').click(); await page.getByTestId('chat-search-toggle').click();
    await page.getByTestId('message-search').fill('fail-search'); await page.locator('#message-search-error').waitFor();
    check(`${prefix}: thread search error is red and tied to its field`, await page.getByTestId('message-search').getAttribute('aria-invalid') === 'true' && await page.locator('#message-search-error').evaluate(el => el.classList.contains('text-danger')));
    await page.getByTestId('message-search').fill('needle'); await page.getByTestId('search-result-1').click();
    await page.locator('#chat-message-1').waitFor();
    check(`${prefix}: thread search jumps beyond the latest 80 messages`, await page.locator('#chat-message-1').getByText('Older needle', { exact: true }).isVisible());

    await page.goto(`${BASE}/chat/10`); await page.locator('.voice-note').waitFor();
    await page.locator('.chat-header').getByTestId('chat-menu').click(); await page.getByTestId('chat-select-toggle').click();
    await page.getByTestId('message-select-101').check(); await page.getByTestId('message-select-102').check();
    await page.getByTestId('forward-selection').click();
    await page.getByTestId('forward-recipient-11').check(); await page.getByTestId('forward-recipient-12').check(); await page.getByTestId('forward-submit').click();
    await page.getByTestId('forward-dialog').waitFor({ state: 'detached' });
    check(`${prefix}: explicit 2-message/2-recipient forwarding excludes all others`, JSON.stringify(forwardBodies.at(-1).message_ids) === '[101,102]' && JSON.stringify(forwardBodies.at(-1).conversation_ids) === '[11,12]' && /^[0-9a-f-]{36}$/.test(forwardBodies.at(-1).operation_id));

    await page.getByTestId('forward-message').first().click();
    await page.getByTestId('forward-recipient-search').fill('fail-search'); await page.locator('#forward-search-error').waitFor();
    check(`${prefix}: recipient search error belongs to the search field`, await page.getByTestId('forward-recipient-search').getAttribute('aria-invalid') === 'true');
    await page.getByTestId('forward-recipient-search').fill(''); await page.getByTestId('forward-recipient-11').waitFor();
    failForward = true; await page.getByTestId('forward-recipient-11').check(); await page.getByTestId('forward-submit').click();
    await page.locator('#forward-recipient-error').waitFor();
    check(`${prefix}: forwarding error is red beside invalid recipient group`, await page.locator('[data-testid="forward-dialog"] fieldset').getAttribute('aria-invalid') === 'true' && await page.locator('#forward-recipient-error').evaluate(el => el.classList.contains('text-danger')));
    const failedOperation=forwardBodies.at(-1).operation_id;
    check(`${prefix}: preflight failure permits a safe retry`, await page.getByTestId('forward-submit').isEnabled());
    failForward=false;await page.getByTestId('forward-submit').click();await page.getByTestId('forward-dialog').waitFor({state:'detached'});
    check(`${prefix}: retry retains the operation ID`, forwardBodies.at(-1).operation_id === failedOperation);
    await page.locator('.chat-header').getByTestId('chat-menu').click();await page.getByTestId('chat-select-toggle').click();
    await page.getByTestId('message-select-101').check();await page.getByTestId('message-select-102').check();await page.getByTestId('forward-selection').click();
    await page.getByTestId('forward-recipient-11').check();await page.getByTestId('forward-recipient-12').check();partialForward=true;
    await page.getByTestId('forward-submit').click();await page.locator('#forward-recipient-error').waitFor();
    const partialOperation=forwardBodies.at(-1).operation_id;
    check(`${prefix}: successful recipients are retained and locked after a partial result`, await page.getByTestId('forward-recipient-11').isChecked() && await page.getByTestId('forward-recipient-11').isDisabled());
    await page.getByTestId('forward-submit').click();await page.getByTestId('forward-dialog').waitFor({state:'detached'});
    check(`${prefix}: retry sends only failed recipients under the same operation`, JSON.stringify(forwardBodies.at(-1).conversation_ids)==='[12]' && forwardBodies.at(-1).operation_id===partialOperation);
    if(width===390){
      await page.getByTestId('forward-message').first().click();await page.getByTestId('forward-recipient-11').check();abortForward=true;
      await page.getByTestId('forward-submit').click();await page.locator('#forward-recipient-error').waitFor();const ambiguousOperation=forwardBodies.at(-1).operation_id;
      check(`${prefix}: transport failure permits retry`,await page.getByTestId('forward-submit').isEnabled());
      await page.getByTestId('forward-submit').click();await page.getByTestId('forward-dialog').waitFor({state:'detached'});
      check(`${prefix}: ambiguous retry keeps its durable identity`,forwardBodies.at(-1).operation_id===ambiguousOperation);
    }
    await page.getByTestId('forward-message').first().click();await page.getByTestId('forward-recipient-11').check();
    const started = new Promise(resolve=>{forwardStarted=resolve;});delayForward=true;
    await page.getByTestId('forward-submit').click();await started;const oldBatch=forwardBodies.at(-1);
    await page.getByTestId('forward-message').nth(1).click();await page.getByTestId('forward-recipient-12').waitFor();
    check(`${prefix}: changing message batch starts with fresh recipients`, !await page.getByTestId('forward-recipient-11').isChecked());
    await page.getByTestId('forward-recipient-12').check();
    const oldResponse = page.waitForResponse(response=>response.url().endsWith('/forward'));releaseForward();await oldResponse;
    await page.waitForTimeout(50);
    check(`${prefix}: old batch completion cannot close or reset a new batch`, await page.getByTestId('forward-dialog').isVisible() && await page.getByTestId('forward-recipient-12').isChecked());
    await page.getByTestId('forward-submit').click();await page.getByTestId('forward-dialog').waitFor({state:'detached'});
    check(`${prefix}: new batch sends its own messages with a new durable identity`, forwardBodies.at(-1).operation_id!==oldBatch.operation_id && JSON.stringify(forwardBodies.at(-1).message_ids)==='[102]' && JSON.stringify(forwardBodies.at(-1).conversation_ids)==='[12]');
    await page.locator('.wa-pill > button').filter({ hasText: '📎' }).click();
    check(`${prefix}: attachment picker offers photo/audio/video/files`, await page.locator('.chat-video-actions button').count() === 4);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await page.getByTestId('attach-photo-input').setInputFiles({ name: 'gallery.png', mimeType: 'image/png', buffer: png });
    await page.getByTestId('attach-audio-input').setInputFiles({ name: 'existing.m4a', mimeType: 'audio/mp4', buffer: Buffer.from(fixtures['voice.m4a'], 'base64') });
    await page.getByTestId('attach-video-input').setInputFiles({ name: 'existing.mp4', mimeType: 'video/mp4', buffer: Buffer.from(fixtures['video.mp4'], 'base64') });
    check(`${prefix}: all three media kinds have drafts`, await page.locator('.chat-draft-attachment img').count() === 1 && await page.locator('.chat-draft-attachment audio').count() === 1 && await page.locator('.chat-draft-attachment video').count() === 1);
    await page.getByTestId('chat-send').click();
    await page.locator('.chat-draft-attachment').first().waitFor({ state: 'detached' });
    check(`${prefix}: file upload includes photo/audio/video selections`, ['gallery.png', 'existing.m4a', 'existing.mp4'].every(name => uploads.at(-1)?.includes(name)));

    await page.goto(`${BASE}/chat`); await page.locator('.conv-item').first().waitFor();
    await page.getByTestId('chat-list-next').click(); await page.getByText('Older peer', { exact: true }).waitFor();
    check(`${prefix}: list pagination reaches conversations past twenty`, await page.locator('.conv-item').count() === 5);
    await page.getByTestId('chat-list-search').fill('Older peer'); await page.waitForFunction(() => document.querySelectorAll('.conv-item').length === 1); await page.getByText('Older peer', { exact: true }).waitFor();
    check(`${prefix}: list search is server-scoped`, await page.locator('.conv-item').count() === 1);
    await page.locator('.chat-sidebar').getByTestId('chat-menu').click(); await page.getByTestId('chat-settings').click();
    check(`${prefix}: list exposes the same saved bold setting`, await page.getByTestId('chat-bold').isChecked());
    await page.keyboard.press('Escape');

    role = 'provider'; await page.goto(`${BASE}/opportunities`); await page.getByTestId('request-card').first().waitFor();
    check(`${prefix}: provider-only account defaults to own work scope`, requestReads.at(-1)?.matching === '1');
    const allRead = page.waitForResponse(response => response.url().includes('/api/requests/nearby') && !new URL(response.url()).searchParams.has('matching'));
    await page.getByTestId('browse-all').click(); await allRead;
    await page.waitForFunction(() => new URL(location.href).searchParams.get('all') === '1');
    await page.getByTestId('request-card').first().waitFor();
    check(`${prefix}: provider-only account can browse all requests`, requestReads.some(q => !q.matching));
    await page.getByTestId('request-card').first().getByTestId('trust-summary').click(); await page.getByTestId('trust-dialog').waitFor();
    check(`${prefix}: requester reputation opens without contacting or navigating`, await page.getByText('Public opinion content', { exact: true }).isVisible() && new URL(page.url()).pathname === '/opportunities');
    await page.getByTestId('trust-dialog').getByRole('button', { name: t('common.close'), exact: true }).click();
    const beforeContact = contactWrites.length;
    await page.getByTestId('request-card').first().click(); await page.getByTestId('app-dialog').waitFor();
    await page.getByTestId('app-dialog').getByRole('button', { name: t('chat.open_previous'), exact: true }).click();
    await page.waitForURL('**/chat/10');
    check(`${prefix}: provider opens previous chat without another contact write`, contactWrites.length === beforeContact);
    await page.locator('.voice-note').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    check(`${prefix}: no client runtime errors`, errors.length === 0);
    await page.screenshot({ path: `${OUT}/chat-${BROWSER}-${lang}-${width}.png` });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${OUT}/chat-${BROWSER}-checks.json`, JSON.stringify(checks, null, 2));
}
if (checks.some(check => !check.ok)) process.exitCode = 1;
