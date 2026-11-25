// AYK-496: a large, deterministic, disposable data set for testing every filter of the site.
// Used by the API matrix test (server/tests/filters-matrix.integration.js) and by the browser
// tests (e2e/filters/stack.cjs). It only ever runs on a newly created disposable database.
//
// Accounts and requests are made through the real HTTP API (so every rule of registration and
// posting applies); afterwards SQL spreads the statuses, dates, availability and visibility so that
// each filter has rows on both sides of its condition.
'use strict';

// Small deterministic generator (same data on every run).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITIES = [1, 2, 3, 4, 14]; // Riyadh, Jeddah, Makkah, Madinah, Qatif (real geography of the install)
const PASSWORD = '1234';
const DAY = 24 * 3600 * 1000;

async function seed({ base, db, providers = 150, clients = 60, requests = 600, log = () => {} }) {
  const rand = rng(496);
  const pick = list => list[Math.floor(rand() * list.length)];
  const chance = p => rand() < p;
  let phoneCounter = 0;
  const nextPhone = () => `05${String(60000000 + (phoneCounter += 1)).padStart(8, '0')}`;

  async function call(path, { token, body, method = 'GET', expected = null } = {}) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 429) { await db.query('DELETE FROM auth_rate_limits'); continue; }
      if (expected && response.status !== expected) throw new Error(`${method} ${path} -> ${response.status} ${result.message}`);
      return { status: response.status, data: result.data };
    }
    throw new Error(`${method} ${path}: rate limited`);
  }
  async function pool(items, size, worker) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: size }, async () => {
      for (;;) { const i = next++; if (i >= items.length) return; out[i] = await worker(items[i], i); }
    }));
    return out;
  }

  // Geography and catalogue as the install has them.
  const districtsOf = {};
  for (const city of CITIES) {
    districtsOf[city] = (await db.query('SELECT id FROM districts WHERE city_id = ? AND is_active = 1 ORDER BY id LIMIT 8', [city])).map(row => Number(row.id));
  }
  const services = await db.query('SELECT s.id, s.category_id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.is_active = 1 AND s.deleted_at IS NULL AND c.is_active = 1 AND c.deleted_at IS NULL ORDER BY s.category_id, s.id');
  const categories = [...new Set(services.map(row => Number(row.category_id)))];
  const servicesOf = Object.fromEntries(categories.map(id => [id, services.filter(row => Number(row.category_id) === id).map(row => Number(row.id))]));

  // ---- providers ----
  log(`providers ${providers}`);
  const providerPlans = Array.from({ length: providers }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    const category = categories[i % categories.length];
    const own = servicesOf[category];
    const chosen = own.slice(0, 1 + Math.floor(rand() * Math.min(3, own.length)));
    if (chance(0.2)) { const other = pick(categories.filter(id => id !== category)); chosen.push(servicesOf[other][0]); } // two professions
    const homeDistricts = districtsOf[city];
    const coverageMode = rand();
    const coverage = coverageMode < 0.6 ? homeDistricts.slice(0, 1 + Math.floor(rand() * 3)) : coverageMode < 0.85 ? [homeDistricts[homeDistricts.length - 1]] : homeDistricts.slice(0, 1);
    return { city, category, services: chosen, district: homeDistricts[Math.floor(rand() * homeDistricts.length)], coverage, phone: nextPhone() };
  });
  const providerRows = await pool(providerPlans, 6, async plan => {
    const { data } = await call('/auth/register', { method: 'POST', expected: 201, body: {
      onboarding_version: 2, role: 'provider', password: PASSWORD, phone: plan.phone, full_name: `مزود ${plan.phone.slice(-4)}`,
      city_id: plan.city, district_id: plan.district, service_ids: plan.services, coverage_district_ids: plan.coverage,
      latitude: 24.7136, longitude: 46.6753,
    } });
    return { ...plan, id: Number(data.user.id), token: data.token };
  });

  // ---- clients ----
  log(`clients ${clients}`);
  const clientPlans = Array.from({ length: clients }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    return { city, district: pick(districtsOf[city]), phone: nextPhone() };
  });
  const clientRows = await pool(clientPlans, 6, async plan => {
    const { data } = await call('/auth/register', { method: 'POST', expected: 201, body: {
      onboarding_version: 2, role: 'client', password: PASSWORD, phone: plan.phone, full_name: `عميل ${plan.phone.slice(-4)}`,
      city_id: plan.city, district_id: plan.district, latitude: 24.7136, longitude: 46.6753,
    } });
    return { ...plan, id: Number(data.user.id), token: data.token };
  });
  await db.query('DELETE FROM auth_rate_limits');

  // ---- requests ----
  log(`requests ${requests}`);
  const requestPlans = Array.from({ length: requests }, (_, i) => {
    const client = clientRows[i % clientRows.length];
    const category = pick(categories);
    const service = chance(0.7) ? pick(servicesOf[category]) : null;
    const city = chance(0.75) ? client.city : pick(CITIES);
    return {
      client, category, service, city, district: pick(districtsOf[city]),
      title: `طلب ${i + 1} ${service ? `خدمة ${service}` : `مهنة ${category}`} في مدينة ${city}`,
      urgent: chance(0.15), budget: chance(0.5) ? 50 + Math.floor(rand() * 20) * 25 : null,
    };
  });
  const requestRows = await pool(requestPlans, 6, async plan => {
    const { data } = await call('/requests', { method: 'POST', token: plan.client.token, expected: 201, body: {
      title: plan.title, description: `وصف الطلب: ${plan.title}`, category_id: plan.category, ...(plan.service ? { service_id: plan.service } : {}),
      city_id: plan.city, district_id: plan.district, latitude: 24.7136, longitude: 46.6753,
      is_urgent: plan.urgent ? 1 : 0, ...(plan.budget ? { budget_min: plan.budget, budget_max: plan.budget + 200 } : {}),
    } });
    return { ...plan, id: Number(data.id || data.request?.id) };
  });

  // ---- spread the states with SQL (each filter needs rows on both sides of its condition) ----
  const now = Date.now();
  // Dates: one per request going back 90 days; a few groups share the same second (ties in ORDER BY).
  for (let i = 0; i < requestRows.length; i += 1) {
    const at = new Date(now - Math.floor(i / 3) * 3 * 3600 * 1000 - (i % 3 === 0 ? 0 : 0));
    await db.query('UPDATE requests SET created_at = ?, updated_at = ? WHERE id = ?', [at.toISOString(), at.toISOString(), requestRows[i].id]);
  }
  const ids = requestRows.map(row => row.id);
  const slice = (from, to) => ids.slice(Math.floor(ids.length * from), Math.floor(ids.length * to));
  const set = async (list, sql) => { if (list.length) await db.query(`UPDATE requests SET ${sql} WHERE id IN (${list.map(() => '?').join(',')})`, list); };
  await set(slice(0.60, 0.70), "status = 'assigned', assigned_provider_id = (SELECT MIN(user_id) FROM provider_profiles), agreed_at = created_at");
  await set(slice(0.70, 0.85), "status = 'completed', completed_at = created_at");
  await set(slice(0.85, 0.93), "status = 'cancelled', cancelled_at = created_at");
  await set(slice(0.93, 0.96), 'hidden_at = CURRENT_TIMESTAMP');
  await set(slice(0.96, 0.98), 'deleted_at = CURRENT_TIMESTAMP');
  await set(slice(0.98, 1.00), `direct_provider_id = ${providerRows[0].id}`);
  await db.query(`UPDATE requests r SET views_count = (r.id * 7) % 50`);
  // Odd but real rows: a request that carries only its service (the profession is the service's), and requests of
  // accounts that were deleted or blocked afterwards.
  const onlyService = requestRows.filter((row, i) => row.service && ids.indexOf(row.id) < ids.length * 0.6).slice(0, 12).map(row => row.id);
  if (onlyService.length) await db.query(`UPDATE requests SET category_id = NULL WHERE id IN (${onlyService.map(() => '?').join(',')})`, onlyService);
  const gone = clientRows.slice(-6, -3).map(c => c.id), blocked = clientRows.slice(-3).map(c => c.id);

  // ---- «power» providers: three professions and the whole city (no district list), so that their lists have several pages ----
  for (const [i, p] of providerRows.slice(0, 4).entries()) {
    const three = [categories[(i) % categories.length], categories[(i + 1) % categories.length], categories[(i + 2) % categories.length]];
    await db.query('UPDATE provider_profiles SET category_id = ?, service_ids = ?::jsonb WHERE user_id = ?', [three[0], JSON.stringify(three.map(c => servicesOf[c][0])), p.id]);
    await db.query('DELETE FROM provider_coverage_districts WHERE user_id = ?', [p.id]);
    p.services = three.map(c => servicesOf[c][0]); p.coverage = []; p.category = three[0]; p.power = true;
  }

  // ---- providers: availability, rating, visibility ----
  const pids = providerRows.map(row => row.id);
  const pset = async (list, sql) => { if (list.length) await db.query(`UPDATE provider_profiles SET ${sql} WHERE user_id IN (${list.map(() => '?').join(',')})`, list); };
  const pslice = (from, to) => pids.slice(Math.floor(pids.length * from), Math.floor(pids.length * to));
  for (let i = 0; i < pids.length; i += 1) {
    await db.query('UPDATE provider_profiles SET rating_avg = ?, rating_count = ?, completed_orders = ? WHERE user_id = ?',
      [(1 + (i * 37 % 41) / 10).toFixed(2), (i * 13) % 40, (i * 29) % 90, pids[i]]);
  }
  await pset(pslice(0.00, 0.08), "availability_status = 'paused'");
  await pset(pslice(0.08, 0.12), `vacation_from = '2020-01-01', vacation_to = '2099-12-31'`);
  await pset(pslice(0.12, 0.22), `work_days = '0,1,2,3,4', work_from = '08:00', work_to = '17:00'`);
  await pset(pslice(0.95, 1.00), 'hidden_at = CURRENT_TIMESTAMP');
  await db.query(`UPDATE users SET is_blocked = 1 WHERE id IN (${pslice(0.90, 0.93).map(() => '?').join(',')})`, pslice(0.90, 0.93));
  await db.query(`UPDATE users SET is_active = 0 WHERE id IN (${pslice(0.93, 0.95).map(() => '?').join(',')})`, pslice(0.93, 0.95));
  await db.query(`UPDATE users SET is_online = 1 WHERE id IN (${pslice(0.30, 0.50).map(() => '?').join(',')})`, pslice(0.30, 0.50));

  // ---- contacts / offers / chats from eligible providers (real API) ----
  log('contacts');
  let contacts = 0; const chats = [];
  const open = requestRows.filter(row => ids.indexOf(row.id) < ids.length * 0.6);
  for (const request of open.slice(0, 120)) {
    const eligible = providerRows.find(p => p.city === request.city && p.services.some(s => servicesOf[request.category].includes(s))
      && p.coverage.includes(request.district) && p.id !== providerRows[0].id);
    if (!eligible) continue;
    const { status, data } = await call(`/requests/${request.id}/contact`, { method: 'POST', token: eligible.token });
    if (status === 200) { contacts += 1; chats.push({ request: request.id, provider: eligible, conversation: Number(data.conversation_id) }); }
  }
  // Messages in most of those chats (an empty chat is not listed), a few finished requests (the archive), a few messages deleted «for me».
  for (const [i, chat] of chats.entries()) {
    if (i % 5 === 4) continue; // left empty on purpose
    for (const text of [`السلام عليكم ${i}`, `أنا جاهز للعمل ${i}`].slice(0, 1 + (i % 2))) {
      await call(`/chat/conversations/${chat.conversation}/messages`, { method: 'POST', token: chat.provider.token, body: { content: text }, expected: 201 });
    }
  }
  // One requester with many chats (more than two pages), to test the chat list's pages.
  const chatty = clientRows[0];
  for (const p of providerRows.slice(4, 34)) {
    const made = await call('/chat/conversations', { method: 'POST', token: chatty.token, body: { user_id: p.id } });
    const id = Number(made.data?.id);
    if (id) await call(`/chat/conversations/${id}/messages`, { method: 'POST', token: p.token, body: { content: `رد من المزود ${p.id}` } });
  }
  const finished = chats.filter((_, i) => i % 4 === 1).map(chat => chat.request);
  if (finished.length) await db.query(`UPDATE requests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id IN (${finished.map(() => '?').join(',')})`, finished);

  // Accounts deleted or blocked afterwards (their requests stay in the table).
  await db.query(`UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${gone.map(() => '?').join(',')})`, gone);
  await db.query(`UPDATE users SET is_blocked = 1 WHERE id IN (${blocked.map(() => '?').join(',')})`, blocked);
  const owner = clientRows[0];
  return { chats: chats.map(c => ({ request: c.request, provider: c.provider.id, conversation: c.conversation })), onlyService, goneClients: gone, blockedClients: blocked, providers: providerRows, clients: clientRows, requests: requestRows, contacts, password: PASSWORD, categories, servicesOf, districtsOf, cities: CITIES, owner };
}

module.exports = { seed, PASSWORD, CITIES };
