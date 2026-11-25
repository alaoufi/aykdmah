// AYK-496: the board (my profession / my area), the chat list, «my tasks», and the administration's lists,
// against independent SQL computations.
import { fixtures, connect, api, allPages, check, summary, saveReport, sameSet, diff, qs, combinations } from './lib.mjs';

const sql = await connect();
const ids = rows => rows.map(r => Number(r.id));
const categories = fixtures.categories;
const catOfService = Object.fromEntries((await sql('SELECT id, category_id FROM services')).map(r => [Number(r.id), Number(r.category_id)]));
const regionOfCity = Object.fromEntries((await sql('SELECT c.id, COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id')).map(r => [Number(r.id), Number(r.region_id)]));
const VISIBLE = "r.deleted_at IS NULL AND r.status = 'open' AND r.hidden_at IS NULL";

// ---------- A. the home board ----------
async function providerView(p) {
  const profile = (await sql(`SELECT pp.service_ids, pp.category_id, COALESCE(pp.coverage_city_id, u.city_id) AS city FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE pp.user_id = $1`, [p.id]))[0];
  const services = (profile.service_ids || []).map(Number);
  const cats = new Set([...services.map(s => catOfService[s]), ...(profile.category_id ? [Number(profile.category_id)] : [])]);
  const districts = (await sql('SELECT district_id FROM provider_coverage_districts WHERE user_id = $1', [p.id])).map(r => Number(r.district_id));
  return { services, cats: [...cats], districts, city: Number(profile.city) };
}
async function expectedBoard(p, { f_prof, f_area }) {
  const v = await providerView(p);
  const rows = await sql(`SELECT r.id, r.category_id, r.service_id, r.district_id, r.city_id, s.category_id AS service_category FROM requests r LEFT JOIN services s ON s.id = r.service_id
    WHERE ${VISIBLE} AND (r.direct_provider_id IS NULL OR r.direct_provider_id = $1 OR r.client_id = $1)`, [p.id]);
  return rows.filter(r => {
    const prof = v.cats.includes(Number(r.category_id ?? r.service_category)) || v.services.includes(Number(r.service_id));
    const area = v.districts.length ? v.districts.includes(Number(r.district_id)) : Number(r.city_id) === v.city;
    return (!f_prof || prof) && (!f_area || area);
  }).map(r => Number(r.id));
}
{
  let n = 0;
  for (const provider of fixtures.providers.slice(0, 16)) {
    for (const combo of [{}, { f_prof: 1 }, { f_area: 1 }, { f_prof: 1, f_area: 1 }]) {
      const want = await expectedBoard(provider, combo);
      const got = await allPages(`/requests/nearby?${qs({ board: 1, matching: 1, ...combo })}`, { token: provider.token, limit: 25, family: 'board (provider)' });
      n += 1;
      const fallback = want.length === 0 && (combo.f_prof || combo.f_area);
      if (fallback) { check(`A board provider ${provider.id} ${JSON.stringify(combo)}: nothing matches → the app shows the rest (fallback) instead of an empty list`, got.ids.length > 0, `got ${got.ids.length}`); continue; }
      check(`A board provider ${provider.id} ${JSON.stringify(combo)}`, got.status === 200 && sameSet(got.ids, want) && got.duplicates.length === 0 && got.total === want.length, got.status !== 200 ? `status ${got.status}` : `${diff(got.ids, want)} dup=${got.duplicates.length} total=${got.total}`);
    }
  }
  console.log(`A: ${n} board combinations`);
  // the profession flag on every card must be true exactly when the profession matches
  const provider = fixtures.providers[2]; const v = await providerView(provider);
  const r = await allPages('/requests/nearby?board=1&matching=1', { token: provider.token, limit: 100, family: 'board (provider)' });
  const info = new Map((await sql('SELECT r.id, r.category_id, r.service_id, s.category_id AS sc FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE r.id = ANY($1::int[])', [r.ids])).map(x => [Number(x.id), x]));
  const wrong = r.rows.filter(row => { const x = info.get(Number(row.id)); return Boolean(row.board_profession) !== (v.cats.includes(Number(x.category_id ?? x.sc)) || v.services.includes(Number(x.service_id))); }).map(row => row.id);
  check('A board card flags «my profession» correctly', wrong.length === 0, wrong.slice(0, 8).join(','));
}

// ---------- B. the chat list ----------
{
  const peersOf = async user => {
    const rows = await sql(`SELECT c.id, c.request_id, other.user_id AS peer, r.status FROM conversations c
      JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = $1
      JOIN conversation_participants other ON other.conversation_id = c.id AND other.user_id <> $1
      LEFT JOIN requests r ON r.id = c.request_id
      JOIN users ou ON ou.id = other.user_id AND ou.deleted_at IS NULL AND ou.is_active = 1 AND ou.is_blocked = 0
      WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL)`, [user]);
    return rows;
  };
  const people = [...new Set(fixtures.chats.map(c => c.provider))].slice(0, 12);
  const clientsInChats = [...new Set((await sql('SELECT DISTINCT r.client_id FROM requests r WHERE r.id = ANY($1::int[])', [fixtures.chats.map(c => c.request)])).map(r => Number(r.client_id)))].slice(0, 8);
  const tokenOf = id => fixtures.providers.find(p => p.id === id)?.token || fixtures.clients.find(c => c.id === id)?.token;
  const deletedIds = new Set((await sql('SELECT id FROM users WHERE deleted_at IS NOT NULL OR is_blocked = 1 OR is_active = 0')).map(r => Number(r.id)));
  for (const user of [...people, ...clientsInChats]) {
    if (deletedIds.has(user)) continue;
    const token = tokenOf(user); if (!token) continue;
    const rows = await peersOf(user);
    const wantPeers = new Set(rows.map(r => Number(r.peer)));
    const all = await allPages('/chat/conversations', { token, limit: 100, family: 'chat/conversations' });
    const gotPeers = all.rows.map(c => (typeof c.other_user === 'string' ? JSON.parse(c.other_user) : c.other_user)?.id).map(Number);
    check(`B chat list of ${user}: one row per person with messages`, sameSet(gotPeers, [...wantPeers]) && new Set(gotPeers).size === gotPeers.length, diff(gotPeers, [...wantPeers]));
    const active = await allPages('/chat/conversations?archived=0', { token, limit: 3, family: 'chat/conversations' });
    const archived = await allPages('/chat/conversations?archived=1', { token, limit: 3, family: 'chat/conversations' });
    const peerOf = c => Number((typeof c.other_user === 'string' ? JSON.parse(c.other_user) : c.other_user)?.id);
    const a = active.rows.map(peerOf), b = archived.rows.map(peerOf);
    check(`B chat list of ${user}: active ∪ archive = all, no overlap, no repeats across pages`, sameSet([...a, ...b], gotPeers) && !a.some(x => b.includes(x)) && new Set(a).size === a.length && new Set(b).size === b.length, `active ${a.length} archive ${b.length} all ${gotPeers.length}`);
  }
  // searching by a person's name finds that person and nobody who does not match
  const peerOf = c => Number((typeof c.other_user === 'string' ? JSON.parse(c.other_user) : c.other_user)?.id);
  const user = people[0]; const token = tokenOf(user);
  const row = (await allPages('/chat/conversations', { token, limit: 50, family: 'chat/conversations' })).rows[0];
  if (row) {
    const other = typeof row.other_user === 'string' ? JSON.parse(row.other_user) : row.other_user;
    const term = String(other.referral_code || other.full_name || '').slice(0, 4);
    if (term) {
      const hit = await allPages(`/chat/conversations?${qs({ q: term })}`, { token, limit: 50, family: 'chat/conversations' });
      check('B chat search finds the person', hit.rows.some(c => peerOf(c) === Number(other.id)), term);
    }
  }
}

// ---------- C. «my tasks» (offers) ----------
{
  for (const provider of fixtures.providers.slice(0, 25)) {
    const real = ids(await sql(`SELECT DISTINCT o.request_id AS id FROM offers o JOIN requests r ON r.id = o.request_id WHERE o.provider_id = $1 AND r.deleted_at IS NULL
      AND (o.price > 0 OR o.status = 'accepted' OR EXISTS (SELECT 1 FROM messages mm JOIN conversations cc ON cc.id = mm.conversation_id WHERE cc.request_id = o.request_id AND mm.sender_id = o.provider_id AND mm.deleted_at IS NULL))`, [provider.id]));
    const got = await allPages('/offers/my', { token: provider.token, limit: 50, key: 'request_id', family: 'offers/my' });
    const active = await allPages('/offers/my?scope=active', { token: provider.token, limit: 50, key: 'request_id', family: 'offers/my' });
    const archive = await allPages('/offers/my?scope=archive', { token: provider.token, limit: 50, key: 'request_id', family: 'offers/my' });
    check(`C my tasks of provider ${provider.id}: only real tasks`, sameSet(got.ids, real) || (got.status === 200 && real.length === 0 && got.ids.length === 0), diff(got.ids, real));
    check(`C my tasks of provider ${provider.id}: active and archive split the list`, sameSet([...active.ids, ...archive.ids], got.ids) && !active.ids.some(id => archive.ids.includes(id)), `${active.ids.length}+${archive.ids.length} vs ${got.ids.length}`);
  }
}

// ---------- D. the administration's lists ----------
{
  const admin = fixtures.adminToken;
  const headers = { 'X-Ayk-Scope': 'admin' };
  const get = (route, family) => api(route, { token: admin, family, headers });
  async function adminPages(route, family, limit = 50) {
    const rows = []; let total = null;
    for (let page = 1; page < 100; page += 1) {
      const r = await get(`${route}${route.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`, family);
      if (r.status !== 200) return { status: r.status, rows, ids: [], total };
      rows.push(...(Array.isArray(r.data) ? r.data : r.data?.items || []));
      total = Number(r.meta?.pagination?.total ?? total);
      if (!r.meta?.pagination?.hasNext) break;
    }
    return { status: 200, rows, ids: rows.map(x => Number(x.id)), total };
  }
  // requests: status × category × city × region × visibility
  const statuses = ['open', 'assigned', 'completed', 'cancelled'];
  const cities = fixtures.cities.slice(0, 3);
  const regions = [...new Set(fixtures.cities.map(c => regionOfCity[c]))].slice(0, 2);
  let n = 0;
  for (const combo of combinations({ status: [undefined, ...statuses], category_id: [undefined, categories[0], categories[4]], city_id: [undefined, cities[0], cities[1]], visibility: [undefined, 'hidden', 'shown'], region_id: [undefined, regions[0]] })) {
    const w = ['r.deleted_at IS NULL']; const params = [];
    const add = (cond, v) => { params.push(v); w.push(cond.replace('?', `$${params.length}`)); };
    if (combo.status) add('r.status = ?', combo.status);
    if (combo.category_id) add('COALESCE(r.category_id, s.category_id) = ?', combo.category_id);
    if (combo.city_id) add('r.city_id = ?', combo.city_id);
    if (combo.region_id) add('COALESCE(c.region_id, g.region_id) = ?', combo.region_id);
    if (combo.visibility === 'hidden') w.push('r.hidden_at IS NOT NULL'); else if (combo.visibility === 'shown') w.push('r.hidden_at IS NULL');
    const want = ids(await sql(`SELECT r.id FROM requests r LEFT JOIN services s ON s.id = r.service_id LEFT JOIN cities c ON c.id = r.city_id LEFT JOIN governorates g ON g.id = c.governorate_id WHERE ${w.join(' AND ')}`, params));
    const got = await adminPages(`/admin/requests?${qs(combo)}`, 'admin/requests');
    n += 1;
    check(`D admin requests ${JSON.stringify(combo)}`, got.status === 200 && sameSet(got.ids, want) && got.total === want.length && new Set(got.ids).size === got.ids.length, got.status !== 200 ? `status ${got.status}` : `${diff(got.ids, want)} total=${got.total}`);
  }
  console.log(`D: ${n} admin request combinations`);
  // providers: region (of the city the provider works in) × city × profession × visibility
  const profs = (await sql(`SELECT u.id, u.city_id, COALESCE(pp.coverage_city_id, u.city_id) AS work_city, pp.category_id, pp.service_ids, pp.hidden_at IS NOT NULL AS hidden FROM users u JOIN provider_profiles pp ON pp.user_id = u.id WHERE u.role = 'provider' AND u.deleted_at IS NULL`));
  for (const combo of combinations({ category_id: [undefined, categories[0], categories[3]], city_id: [undefined, cities[0]], visibility: [undefined, 'hidden', 'shown'], region_id: [undefined, regions[0]] })) {
    const want = profs.filter(p => (!combo.category_id || Number(p.category_id) === combo.category_id || (p.service_ids || []).some(s => catOfService[Number(s)] === combo.category_id))
      && (!combo.city_id || Number(p.city_id) === combo.city_id) && (!combo.region_id || regionOfCity[Number(p.city_id)] === combo.region_id)
      && (combo.visibility !== 'hidden' || p.hidden) && (combo.visibility !== 'shown' || !p.hidden)).map(p => Number(p.id));
    const got = await adminPages(`/admin/providers?${qs(combo)}`, 'admin/providers');
    check(`D admin providers ${JSON.stringify(combo)}`, got.status === 200 && sameSet(got.ids, want) && got.total === want.length, got.status !== 200 ? `status ${got.status}` : `${diff(got.ids, want)} total=${got.total}`);
  }
  // users: role × search
  for (const role of [undefined, 'client', 'provider']) {
    const want = Number((await sql(`SELECT COUNT(*) AS n FROM users u WHERE u.deleted_at IS NULL ${role ? 'AND u.role = $1' : "AND u.role <> 'admin'"}`, role ? [role] : []))[0].n);
    const got = await adminPages(`/users?${qs({ role })}`, 'admin/users');
    check(`D admin users role=${role ?? 'any'}: total`, got.status === 200 && got.total >= 1 && new Set(got.ids).size === got.ids.length, `status ${got.status} total ${got.total} rows ${got.ids.length} want≈${want}`);
  }
  // search: by name, by phone in several writings, by number
  const pick = fixtures.providers[7];
  const phone = (await sql('SELECT phone, full_name, referral_code FROM users WHERE id = $1', [pick.id]))[0];
  for (const term of [phone.phone, `+966${phone.phone.slice(1)}`, `00966${phone.phone.slice(1)}`, phone.full_name, phone.full_name.toUpperCase(), String(phone.referral_code)]) {
    const a = await adminPages(`/admin/providers?${qs({ search: term })}`, 'admin/providers');
    check(`D admin providers search «${term}» finds the provider`, a.ids.includes(pick.id), `found ${a.ids.length}`);
  }
}

// ---------- E. a deleted account does not keep working ----------
{
  for (const id of fixtures.goneClients) {
    const token = fixtures.clients.find(c => c.id === id)?.token;
    const r = await api('/auth/me', { token, family: 'auth/me' });
    check(`E a deleted account (${id}) can no longer use its old token`, r.status === 401 || r.status === 403, `status ${r.status}`);
  }
}

const bad = summary('API lists');
saveReport('api-lists');
await sql.end();
process.exit(bad.length ? 1 : 0);
