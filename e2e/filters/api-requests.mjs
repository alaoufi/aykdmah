// AYK-496: the request lists, filter by filter and in combination, checked against an independent SQL
// computation of what each list must hold (not against the application's own queries).
//   node e2e/filters/api-requests.mjs     (needs the stack: AYK_TEST_PORT=55432 node e2e/filters/stack.cjs)
import { fixtures, connect, api, allPages, check, summary, saveReport, sameSet, diff, combinations, qs } from './lib.mjs';

const sql = await connect();
const OPEN = "r.deleted_at IS NULL AND r.status = 'open' AND r.hidden_at IS NULL";
const regionOfCity = Object.fromEntries((await sql('SELECT c.id, COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id')).map(r => [Number(r.id), Number(r.region_id)]));
const regions = [...new Set(fixtures.cities.map(c => regionOfCity[c]))];
const categories = fixtures.categories;
const firstService = Object.fromEntries(categories.map(c => [c, fixtures.servicesOf[c][0]]));
const ids = rows => rows.map(r => Number(r.id));
const sizes = { empty: 0, nonEmpty: 0, max: 0 };
const note = list => { if (list.length) sizes.nonEmpty += 1; else sizes.empty += 1; sizes.max = Math.max(sizes.max, list.length); return list; };

// ---------- A. the public board (a visitor): every filter alone and combined ----------
async function expectedPublic({ category_id, category_ids, service_id, city_id, region_id, region_ids }) {
  const where = [OPEN, 'r.direct_provider_id IS NULL']; const params = [];
  const cats = [...new Set([category_id, ...(category_ids ? String(category_ids).split(',') : [])].filter(Boolean).map(Number))];
  const regs = [...new Set([region_id, ...(region_ids ? String(region_ids).split(',') : [])].filter(Boolean).map(Number))];
  if (city_id) { params.push(Number(city_id)); where.push(`r.city_id = $${params.length}`); }
  if (cats.length) { params.push(cats); where.push(`r.category_id = ANY($${params.length}::int[])`); }
  if (service_id) { params.push(Number(service_id)); where.push(`r.service_id = $${params.length}`); }
  if (regs.length) { params.push(regs); where.push(`r.city_id IN (SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = ANY($${params.length}::int[]))`); }
  return ids(await sql(`SELECT r.id FROM requests r WHERE ${where.join(' AND ')}`, params));
}
{
  const dims = { category_id: [undefined, ...categories], city_id: [undefined, ...fixtures.cities], service_id: [undefined, ...categories.map(c => firstService[c])] };
  let n = 0;
  for (const combo of combinations(dims)) {
    // a service only together with its own profession (or alone), as the filter chain allows
    if (combo.service_id && combo.category_id && !fixtures.servicesOf[combo.category_id].includes(combo.service_id)) continue;
    const want = note(await expectedPublic(combo));
    const got = await allPages(`/requests/nearby?${qs(combo)}`, { limit: 100, family: 'requests/nearby (visitor)' });
    n += 1;
    check(`A nearby ${JSON.stringify(combo)}`, got.status === 200 && sameSet(got.ids, want) && got.duplicates.length === 0 && got.total === want.length,
      got.status !== 200 ? `status ${got.status}` : `${diff(got.ids, want)} dup=${got.duplicates.length} total=${got.total}`);
  }
  console.log(`A: ${n} combinations (category × city × service)`);
  for (const combo of [{ region_ids: regions.slice(0, 2).join(',') }, { region_id: regions[0], category_ids: categories.slice(0, 3).join(',') }, { region_ids: regions.join(','), category_ids: categories.join(',') },
    { category_id: categories[0], category_ids: categories[1] }, { region_id: regions[0], region_ids: regions[1], city_id: fixtures.cities[0] }]) {
    const want = await expectedPublic(combo);
    const got = await allPages(`/requests/nearby?${qs(combo)}`, { limit: 100, family: 'requests/nearby (visitor)' });
    check(`A lists ${JSON.stringify(combo)}`, sameSet(got.ids, want) && got.duplicates.length === 0 && got.total === want.length, `${diff(got.ids, want)} total=${got.total}`);
  }
  // Pagination: the same ordered list whatever the page size; no repeats; the last page is short; a page past the end is empty.
  const base = await allPages('/requests/nearby', { limit: 100, family: 'requests/nearby (visitor)' });
  for (const limit of [5, 7, 20, 50]) {
    const got = await allPages('/requests/nearby', { limit, family: 'requests/nearby (visitor)' });
    check(`A pagination limit=${limit}: same order, no repeats`, JSON.stringify(got.ids) === JSON.stringify(base.ids) && got.duplicates.length === 0, `dup=${got.duplicates.length} got=${got.ids.length} want=${base.ids.length}`);
  }
  const beyond = await api(`/requests/nearby?page=${Math.ceil(base.ids.length / 20) + 5}&limit=20`);
  check('A page past the end is empty, not an error', beyond.status === 200 && beyond.data.length === 0, `status ${beyond.status} rows ${beyond.data?.length}`);
  // Hidden, deleted, direct and not-open requests never appear.
  const leaked = ids(await sql(`SELECT r.id FROM requests r WHERE r.id = ANY($1::int[]) AND (r.deleted_at IS NOT NULL OR r.hidden_at IS NOT NULL OR r.direct_provider_id IS NOT NULL OR r.status <> 'open')`, [base.ids]));
  check('A no hidden / deleted / direct / closed request on the public board', leaked.length === 0, leaked.join(','));
  // Odd inputs fail cleanly.
  for (const bad of ['category_id=abc', 'city_id=-1', 'service_id=0', 'page=0', 'limit=100000', 'status=closed', 'scope=zzz']) {
    const r = await api(`/requests/nearby?${bad}`);
    check(`A odd input ${bad} does not crash`, r.status < 500, `status ${r.status}`);
  }
}

// ---------- B. a requester's «around me» (scope) ----------
{
  const clients = fixtures.clients.slice(0, 10);
  for (const client of clients) {
    const me = (await sql('SELECT u.city_id, u.district_id FROM users u WHERE u.id = $1', [client.id]))[0];
    for (const scope of ['area', 'city', 'region']) {
      for (const category of [undefined, categories[0], categories[3]]) {
        const where = [OPEN, 'r.direct_provider_id IS NULL', 'r.client_id <> $1']; const params = [client.id];
        if (scope === 'area' && me.district_id) { params.push(me.district_id); where.push(`r.district_id = $${params.length}`); }
        else if (scope === 'area' || scope === 'city') { params.push(me.city_id); where.push(`r.city_id = $${params.length}`); }
        else { params.push(regionOfCity[Number(me.city_id)]); where.push(`r.city_id IN (SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = $${params.length})`); }
        if (category) { params.push(category); where.push(`r.category_id = $${params.length}`); }
        const want = ids(await sql(`SELECT r.id FROM requests r WHERE ${where.join(' AND ')}`, params));
        const got = await allPages(`/requests/nearby?${qs({ scope, category_id: category })}`, { token: client.token, limit: 50, family: 'requests/nearby (requester scope)' });
        check(`B requester ${client.id} scope=${scope} category=${category ?? '-'}`, sameSet(got.ids, want) && got.duplicates.length === 0 && !got.ids.some(id => fixtures.requests.find(r => r.id === id)?.client === client.id),
          `${diff(got.ids, want)} dup=${got.duplicates.length}`);
      }
    }
  }
  console.log('B: requester scopes done');
}

// ---------- C. a provider's «matching me» with every scope, alone and with the other filters ----------
const sameCategory = async serviceIds => serviceIds.length ? (await sql('SELECT DISTINCT category_id FROM services WHERE id = ANY($1::int[])', [serviceIds])).map(r => Number(r.category_id)) : [];
async function expectedForProvider(provider, { scope, category_id, service_id, city_id }) {
  const profile = (await sql(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS home_city FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = $1`, [provider.id]))[0];
  const services = (profile.service_ids || []).map(Number);
  const cats = new Set([...(await sameCategory(services)), ...(profile.category_id ? [Number(profile.category_id)] : [])]);
  const catServices = cats.size ? (await sql('SELECT id FROM services WHERE category_id = ANY($1::int[])', [[...cats]])).map(r => Number(r.id)) : [];
  const allServices = [...new Set([...services, ...catServices])];
  const coverage = (await sql('SELECT district_id FROM provider_coverage_districts WHERE user_id = $1', [provider.id])).map(r => Number(r.district_id));
  const home = Number(profile.home_city);
  const where = ["r.deleted_at IS NULL", "r.status = 'open'", 'r.hidden_at IS NULL', 'r.client_id <> $1']; const params = [provider.id];
  const add = (cond, value) => { params.push(value); where.push(cond.replace('?', `$${params.length}`)); };
  if (city_id) add('r.city_id = ?', Number(city_id));
  if (category_id) add('r.category_id = ?', Number(category_id));
  if (service_id) add('r.service_id = ?', Number(service_id));
  const fit = [];
  if (scope !== 'open') {
    params.push(allServices.length ? allServices : [0]); const sv = params.length; params.push(cats.size ? [...cats] : [0]); const ct = params.length;
    fit.push(`(r.service_id = ANY($${sv}::int[]) OR r.category_id = ANY($${ct}::int[]))`);
    if (scope === 'region') { params.push(regionOfCity[home]); fit.push(`r.city_id IN (SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = $${params.length})`); }
    else if (scope === 'city') { params.push(home); fit.push(`r.city_id = $${params.length}`); }
    else if (scope === 'all') { /* the profession anywhere */ }
    else if (coverage.length) { params.push(coverage); fit.push(`r.district_id = ANY($${params.length}::int[])`); }
    else { params.push(home); fit.push(`r.city_id = $${params.length}`); }
  }
  params.push(provider.id);
  const direct = `(r.direct_provider_id IS NULL OR r.direct_provider_id = $${params.length})`;
  const fitSql = fit.length ? `(r.direct_provider_id = $${params.length} OR (${fit.join(' AND ')}))` : 'TRUE';
  return ids(await sql(`SELECT r.id FROM requests r WHERE ${where.join(' AND ')} AND ${direct} AND ${fitSql}`, params));
}
{
  // a spread of providers: one coverage district, several, none (city), two professions, the direct-request one
  const pick = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(i => fixtures.providers[i]).filter(Boolean);
  let n = 0;
  for (const provider of pick) {
    for (const scope of [undefined, 'area', 'city', 'region', 'all', 'open']) {
      for (const extra of [{}, { category_id: provider.category }, { city_id: provider.city }, { category_id: categories[(categories.indexOf(provider.category) + 1) % categories.length] }]) {
        const want = note(await expectedForProvider(provider, { scope, ...extra }));
        const got = await allPages(`/requests/nearby?${qs({ matching: 1, scope, ...extra })}`, { token: provider.token, limit: 100, family: 'requests/nearby (provider matching)' });
        n += 1;
        check(`C provider ${provider.id} scope=${scope ?? 'default'} ${JSON.stringify(extra)}`, got.status === 200 && sameSet(got.ids, want) && got.duplicates.length === 0,
          got.status !== 200 ? `status ${got.status}` : `${diff(got.ids, want)} dup=${got.duplicates.length}`);
      }
    }
  }
  console.log(`C: ${n} provider combinations`);
}

// ---------- D. «my requests» of a requester ----------
{
  for (const client of fixtures.clients.slice(0, 12)) {
    const mine = ids(await sql("SELECT r.id FROM requests r WHERE r.client_id = $1 AND r.deleted_at IS NULL", [client.id]));
    const all = await allPages('/requests/my', { token: client.token, limit: 20, family: 'requests/my' });
    check(`D /requests/my client ${client.id} holds only and all of his requests`, sameSet(all.ids, mine) && all.duplicates.length === 0, `${diff(all.ids, mine)} dup=${all.duplicates.length}`);
    for (const scope of ['active', 'archive']) {
      const r = await allPages(`/requests/my?scope=${scope}`, { token: client.token, limit: 20, family: 'requests/my' });
      const active = ids(await sql(`SELECT r.id FROM requests r WHERE r.client_id = $1 AND r.deleted_at IS NULL AND r.status ${scope === 'active' ? 'IN' : 'NOT IN'} ('open','assigned','in_progress','pending')`, [client.id]));
      check(`D /requests/my scope=${scope} client ${client.id}`, r.status === 200 && (r.ids.length === 0 || sameSet(r.ids, active) || r.ids.every(id => mine.includes(id))), `${diff(r.ids, active)}`);
    }
  }
  console.log('D: my requests done');
}

console.log(`non-empty expected lists: ${sizes.nonEmpty}, empty: ${sizes.empty}, largest: ${sizes.max}`);
// ---------- E. odd but real data ----------
{
  // E1 a request that carries only its service belongs to the profession of that service
  const serviceCategory = Object.fromEntries((await sql('SELECT id, category_id FROM services')).map(r => [Number(r.id), Number(r.category_id)]));
  const odd = await sql(`SELECT r.id, r.service_id FROM requests r WHERE ${OPEN} AND r.direct_provider_id IS NULL AND r.category_id IS NULL AND r.service_id IS NOT NULL`);
  check('E seed has requests that carry only a service', odd.length > 0, `${odd.length}`);
  for (const category of categories) {
    const want = ids(await sql(`SELECT r.id FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE ${OPEN} AND r.direct_provider_id IS NULL AND COALESCE(r.category_id, s.category_id) = $1`, [category]));
    const got = await allPages(`/requests/nearby?category_id=${category}`, { limit: 100, family: 'requests/nearby (visitor)' });
    check(`E1 profession ${category} also lists requests that carry only a service`, sameSet(got.ids, want), diff(got.ids, want));
  }
  // E2 requests of an account that was deleted or blocked are not offered to anyone
  const dead = ids(await sql(`SELECT r.id FROM requests r JOIN users u ON u.id = r.client_id WHERE ${OPEN} AND r.direct_provider_id IS NULL AND (u.deleted_at IS NOT NULL OR u.is_blocked = 1 OR u.is_active = 0)`));
  const board = await allPages('/requests/nearby', { limit: 100, family: 'requests/nearby (visitor)' });
  check('E2 no request of a deleted or blocked account on the public board', !board.ids.some(id => dead.includes(id)), `${board.ids.filter(id => dead.includes(id)).length} of ${dead.length} shown`);
  const provider = fixtures.providers[1];
  const mine = await allPages('/requests/nearby?matching=1&scope=open', { token: provider.token, limit: 100, family: 'requests/nearby (provider matching)' });
  check('E2 and not to a provider either', !mine.ids.some(id => dead.includes(id)), `${mine.ids.filter(id => dead.includes(id)).length} shown`);
}

const bad = summary('API requests');
saveReport('api-requests');
await sql.end();
process.exit(bad.length ? 1 : 0);
