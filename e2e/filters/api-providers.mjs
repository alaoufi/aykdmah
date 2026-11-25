// AYK-496: provider lists (the requester's list, the visitor's regions and professions, the map, the area
// statistics) against an independent SQL computation, plus the availability state against the work schedule.
import { fixtures, connect, api, check, summary, saveReport, sameSet, diff, combinations, qs } from './lib.mjs';

const sql = await connect();
const num = rows => rows.map(r => Number(r.id));
const regionOfCity = Object.fromEntries((await sql('SELECT c.id, COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id')).map(r => [Number(r.id), Number(r.region_id)]));
const cityOfDistrict = Object.fromEntries((await sql('SELECT id, city_id FROM districts WHERE city_id = ANY($1::int[])', [fixtures.cities])).map(r => [Number(r.id), Number(r.city_id)]));
const categories = fixtures.categories;
const catOfService = Object.fromEntries((await sql('SELECT id, category_id FROM services')).map(r => [Number(r.id), Number(r.category_id)]));
const regions = [...new Set(fixtures.cities.map(c => regionOfCity[c]))];

// every eligible provider with what the filters look at
const providers = (await sql(`SELECT u.id, pp.category_id, pp.service_ids, COALESCE(pp.coverage_city_id, u.city_id) AS home_city, u.city_id,
    pp.availability_status, pp.vacation_from, pp.vacation_to, pp.work_days, pp.work_from, pp.work_to, pp.work_schedule, c.latitude, c.longitude
  FROM users u JOIN provider_profiles pp ON pp.user_id = u.id LEFT JOIN cities c ON c.id = u.city_id
  WHERE u.role = 'provider' AND u.is_active = 1 AND u.is_blocked = 0 AND u.deleted_at IS NULL AND pp.hidden_at IS NULL`)).map(p => ({
  ...p, id: Number(p.id), home_city: Number(p.home_city), services: (p.service_ids || []).map(Number),
  categories: new Set([...(p.category_id ? [Number(p.category_id)] : []), ...(p.service_ids || []).map(s => catOfService[Number(s)]).filter(Boolean)]),
}));
const coverageRows = await sql('SELECT user_id, district_id FROM provider_coverage_districts');
const coverage = new Map();
for (const row of coverageRows) { const list = coverage.get(Number(row.user_id)) || []; list.push(Number(row.district_id)); coverage.set(Number(row.user_id), list); }

function covers(p, { district, city, scope, regionList, everywhere }) {
  const own = coverage.get(p.id) || [];
  if (everywhere) return true;
  if (regionList) return own.length ? own.some(d => regionList.includes(regionOfCity[cityOfDistrict[d]])) : regionList.includes(regionOfCity[p.home_city]);
  if (scope === 'region') { const r = regionOfCity[city]; return own.length ? own.some(d => regionOfCity[cityOfDistrict[d]] === r) : regionOfCity[p.home_city] === r; }
  if (scope === 'city' || !district) return own.length ? own.some(d => cityOfDistrict[d] === city) : p.home_city === city;
  return own.length ? own.includes(district) : p.home_city === city;
}
const matchesProfession = (p, { category, categoryList, service }) => {
  if (service && !p.services.includes(service)) return false;
  const wanted = categoryList || (category ? [category] : null);
  return !wanted || wanted.some(c => p.categories.has(c));
};

// ---------- A. «providers for me» by area scope × profession × service ----------
let nonEmpty = 0, empty = 0;
{
  const places = fixtures.cities.slice(0, 3).map(city => ({ city, district: fixtures.districtsOf[city][1] }));
  const dims = { scope: ['area', 'city', 'region', 'all'], category_id: [undefined, categories[0], categories[2], categories[5]] };
  for (const place of places) {
    for (const combo of combinations(dims)) {
      const want = providers.filter(p => covers(p, { district: place.district, city: place.city, scope: combo.scope, everywhere: combo.scope === 'all' })
        && matchesProfession(p, { category: combo.category_id })).map(p => p.id);
      (want.length ? nonEmpty++ : empty++);
      const r = await api(`/providers/matching?${qs({ city_id: place.city, district_id: place.district, ...combo })}`, { family: 'providers/matching' });
      const got = (r.data?.providers || []).map(p => Number(p.id));
      check(`A matching city=${place.city} district=${place.district} ${JSON.stringify(combo)}`, r.status === 200 && sameSet(got, want) && new Set(got).size === got.length, r.status !== 200 ? `status ${r.status}` : diff(got, want));
      if (combo.scope === 'area') {
        const wantCity = providers.filter(p => covers(p, { district: null, city: place.city, scope: 'city' }) && matchesProfession(p, { category: combo.category_id })).map(p => p.id);
        const gotCity = (r.data?.city_providers || []).map(p => Number(p.id));
        check(`A matching «everyone in the city» city=${place.city} ${JSON.stringify(combo)}`, sameSet(gotCity, wantCity), diff(gotCity, wantCity));
      }
    }
  }
  // service chain: a service only with its own profession
  for (const category of categories.slice(0, 4)) {
    for (const service of fixtures.servicesOf[category].slice(0, 2)) {
      const place = { city: fixtures.cities[0], district: fixtures.districtsOf[fixtures.cities[0]][0] };
      const want = providers.filter(p => covers(p, { ...place, scope: 'city' }) && matchesProfession(p, { category, service })).map(p => p.id);
      const r = await api(`/providers/matching?${qs({ city_id: place.city, scope: 'city', category_id: category, service_id: service })}`, { family: 'providers/matching' });
      const got = (r.data?.providers || []).map(p => Number(p.id));
      check(`A matching category=${category} service=${service}`, sameSet(got, want), diff(got, want));
    }
  }
}

// ---------- B. the visitor's several regions and professions ----------
{
  for (const regionList of [[regions[0]], regions.slice(0, 2), regions]) {
    for (const categoryList of [undefined, [categories[0]], categories.slice(0, 3), categories]) {
      const want = providers.filter(p => covers(p, { regionList }) && matchesProfession(p, { categoryList })).map(p => p.id);
      (want.length ? nonEmpty++ : empty++);
      const r = await api(`/providers/matching?${qs({ scope: 'all', region_ids: regionList.join(','), category_ids: categoryList?.join(',') })}`, { family: 'providers/matching' });
      const got = (r.data?.providers || []).map(p => Number(p.id));
      check(`B visitor regions=[${regionList}] professions=[${categoryList ?? 'all'}]`, r.status === 200 && sameSet(got, want), diff(got, want));
    }
  }
  console.log(`A/B: ${nonEmpty} non-empty and ${empty} empty expected lists`);
}

// ---------- C. availability against the schedule (three endpoints must agree with each other and the schedule) ----------
function saudiNow() { const d = new Date(Date.now() + 3 * 3600 * 1000); return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) }; }
function expectedState(p) {
  const now = saudiNow();
  if (p.availability_status === 'paused') return 'paused';
  if (p.vacation_from && p.vacation_to && now.date >= p.vacation_from && now.date <= p.vacation_to) return 'vacation';
  const days = p.work_days ? String(p.work_days).split(',').map(Number) : null;
  if (days && !days.includes(now.day)) return 'off_day';
  if (p.work_from && p.work_to) {
    const toMin = t => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
    const a = toMin(p.work_from), b = toMin(p.work_to);
    const inside = a <= b ? now.minutes >= a && now.minutes < b : now.minutes >= a || now.minutes < b;
    if (!inside) return 'off_hours';
  }
  return 'available';
}
{
  const sample = providers.filter(p => !p.work_schedule || Object.keys(p.work_schedule || {}).length === 0).slice(0, 60);
  const place = { city: fixtures.cities[0], district: fixtures.districtsOf[fixtures.cities[0]][0] };
  const listed = await api(`/providers/matching?${qs({ city_id: place.city, scope: 'all' })}`, { family: 'providers/matching' });
  const byId = new Map((listed.data?.providers || []).map(p => [Number(p.id), p]));
  let compared = 0, wrong = [];
  for (const p of sample) {
    const row = byId.get(p.id); if (!row) continue;
    compared += 1;
    const want = expectedState(p);
    if (row.availability?.state !== want) wrong.push(`${p.id}:${row.availability?.state}!=${want}`);
  }
  check(`C availability in the list follows the schedule (${compared} providers)`, compared > 20 && wrong.length === 0, wrong.slice(0, 6).join(' '));
  let disagree = [];
  for (const p of sample.slice(0, 25)) {
    const one = await api(`/users/${p.id}`, { family: 'users/:id' });
    const a = one.data?.provider?.availability?.state, b = byId.get(p.id)?.availability?.state;
    if (b && a !== b) disagree.push(`${p.id}:${a}/${b}`);
  }
  check('C the profile page and the list give the same availability', disagree.length === 0, disagree.join(' '));
  const availableNow = (listed.data?.providers || []).filter(p => p.availability?.state === 'available').length;
  const wantAvailable = sample.filter(p => byId.has(p.id) && expectedState(p) === 'available').length;
  check('C «available now» count of the list equals the schedule count', (listed.data?.providers || []).filter(p => sample.some(s => s.id === Number(p.id)) && p.availability?.state === 'available').length === wantAvailable, `api ${availableNow} (all) / sample ${wantAvailable}`);
}

// ---------- D. the map (radius, profession, available only) ----------
{
  const rad = (a) => a * Math.PI / 180;
  const km = (la1, lo1, la2, lo2) => 6371 * Math.acos(Math.min(1, Math.max(-1, Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2) - rad(lo1)) + Math.sin(rad(la1)) * Math.sin(rad(la2)))));
  const cities = await sql('SELECT id, latitude, longitude FROM cities WHERE id = ANY($1::int[])', [fixtures.cities]);
  const centre = cities.find(c => Number(c.id) === fixtures.cities[0]);
  for (const radius of [5, 25, 120, 400]) {
    for (const category of [undefined, categories[1]]) {
      for (const availableOnly of [false, true]) {
        const want = providers.filter(p => {
          if (p.latitude == null) return false;
          const d = km(Number(centre.latitude), Number(centre.longitude), Number(p.latitude), Number(p.longitude));
          return d <= Math.min(radius, 250) && matchesProfession(p, { category }) && (!availableOnly || expectedState(p) === 'available');
        }).map(p => p.id);
        const r = await api(`/providers/nearby?${qs({ lat: centre.latitude, lon: centre.longitude, radius_km: radius, category_id: category, available: availableOnly ? 1 : undefined })}`, { family: 'providers/nearby' });
        const got = (r.data?.providers || []).map(p => Number(p.id));
        check(`D map radius=${radius} category=${category ?? '-'} available=${availableOnly}`, r.status === 200 && sameSet(got, want), r.status !== 200 ? `status ${r.status}` : diff(got, want));
      }
    }
  }
  // «available_only» is not what the client sends; the real name is «available»
  const both = await api(`/providers/nearby?${qs({ lat: centre.latitude, lon: centre.longitude, radius_km: 400, available_only: 1 })}`, { family: 'providers/nearby' });
  const plain = await api(`/providers/nearby?${qs({ lat: centre.latitude, lon: centre.longitude, radius_km: 400 })}`, { family: 'providers/nearby' });
  check('D map: an unknown parameter «available_only» changes nothing (documented)', both.data?.providers?.length === plain.data?.providers?.length, '');
}

// ---------- E. area statistics agree with the list ----------
{
  for (const city of fixtures.cities.slice(0, 3)) {
    const place = { city, district: fixtures.districtsOf[city][0] };
    const r = await api(`/providers/area-stats?${qs({ city_id: city, district_id: place.district })}`, { family: 'providers/area-stats' });
    const rows = r.data?.categories || [];
    for (const category of categories) {
      const want = providers.filter(p => covers(p, { ...place, scope: 'area' }) && p.categories.has(category)).length;
      const got = Number(rows.find(row => Number(row.category_id) === category)?.providers || 0);
      check(`E area-stats city=${city} category=${category}: providers`, got === want, `api ${got} want ${want}`);
    }
    // open requests in the area per profession: the same as the public board for that area
    for (const category of categories.slice(0, 4)) {
      const wantOpen = Number((await sql(`SELECT COUNT(*) AS n FROM requests r WHERE r.deleted_at IS NULL AND r.hidden_at IS NULL AND r.direct_provider_id IS NULL AND r.status = 'open' AND r.district_id = $1 AND COALESCE(r.category_id, (SELECT s.category_id FROM services s WHERE s.id = r.service_id)) = $2`, [place.district, category]))[0].n);
      const gotOpen = Number(rows.find(row => Number(row.category_id) === category)?.open_requests || 0);
      check(`E area-stats city=${city} category=${category}: open requests`, gotOpen === wantOpen, `api ${gotOpen} want ${wantOpen}`);
    }
  }
}

// ---------- F. «my market» numbers agree with the lists ----------
{
  for (const provider of fixtures.providers.slice(0, 14)) {
    const p = providers.find(x => x.id === provider.id); if (!p) continue;
    const own = coverage.get(p.id) || [];
    const r = await api('/providers/my-market', { token: provider.token, family: 'providers/my-market' });
    for (const row of r.data?.categories || []) {
      const category = Number(row.category_id);
      const area = own.length ? 'r.district_id = ANY($2::int[])' : 'r.city_id = $2';
      const want = Number((await sql(`SELECT COUNT(*) AS n FROM requests r WHERE r.deleted_at IS NULL AND r.hidden_at IS NULL AND r.direct_provider_id IS NULL AND r.status = 'open'
        AND r.client_id <> $1 AND ${area} AND COALESCE(r.category_id, (SELECT s.category_id FROM services s WHERE s.id = r.service_id)) = $3
        AND EXISTS (SELECT 1 FROM users cu WHERE cu.id = r.client_id AND cu.deleted_at IS NULL AND cu.is_active = 1 AND cu.is_blocked = 0)`, [p.id, own.length ? own : p.home_city, category]))[0].n);
      check(`F my-market provider ${p.id} profession ${category}: «open now» = the open requests of the area`, Number(row.open_now) === want, `api ${row.open_now} want ${want}`);
    }
  }
}

const bad = summary('API providers');
saveReport('api-providers');
await sql.end();
process.exit(bad.length ? 1 : 0);
