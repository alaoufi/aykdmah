// AYK-497: property-based (fast-check) check of the public lists: any combination of filters the site can send must
// give exactly what the database holds. A failing combination is shrunk to the smallest one that still fails.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtures, connect, allPages, api, check, summary, saveReport, sameSet, qs } from './lib.mjs';
const fc = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'package.json'))('fast-check');

const sql = await connect();
const regionOfCity = Object.fromEntries((await sql('SELECT c.id, COALESCE(c.region_id, g.region_id) AS region_id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id')).map(r => [Number(r.id), Number(r.region_id)]));
const regions = [...new Set(Object.values(regionOfCity))].filter(Boolean);
const categories = fixtures.categories;
const services = categories.flatMap(c => fixtures.servicesOf[c]);
const catOfService = Object.fromEntries(categories.flatMap(c => fixtures.servicesOf[c].map(s => [s, c])));
const subset = (list, max) => fc.uniqueArray(fc.constantFrom(...list), { minLength: 0, maxLength: max });

const filters = fc.record({
  category_id: fc.option(fc.constantFrom(...categories), { nil: undefined }),
  category_ids: subset(categories, 3),
  city_id: fc.option(fc.constantFrom(...fixtures.cities), { nil: undefined }),
  region_id: fc.option(fc.constantFrom(...regions), { nil: undefined }),
  region_ids: subset(regions, 3),
  service_id: fc.option(fc.constantFrom(...services), { nil: undefined }),
});
const params = f => ({ ...f, category_ids: f.category_ids.join(',') || undefined, region_ids: f.region_ids.join(',') || undefined });

async function wantRequests(f) {
  const cats = [...new Set([f.category_id, ...f.category_ids].filter(Boolean))];
  const regs = [...new Set([f.region_id, ...f.region_ids].filter(Boolean))];
  const w = ["r.deleted_at IS NULL AND r.status = 'open' AND r.hidden_at IS NULL AND r.direct_provider_id IS NULL",
    'EXISTS (SELECT 1 FROM users cu WHERE cu.id = r.client_id AND cu.deleted_at IS NULL AND cu.is_active = 1 AND cu.is_blocked = 0)'];
  const p = [];
  if (f.city_id) { p.push(f.city_id); w.push(`r.city_id = $${p.length}`); }
  if (cats.length) { p.push(cats); w.push(`COALESCE(r.category_id, s.category_id) = ANY($${p.length}::int[])`); }
  if (f.service_id) { p.push(f.service_id); w.push(`r.service_id = $${p.length}`); }
  if (regs.length) { p.push(regs); w.push(`r.city_id IN (SELECT c.id FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE COALESCE(c.region_id, g.region_id) = ANY($${p.length}::int[]))`); }
  return (await sql(`SELECT r.id FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE ${w.join(' AND ')}`, p)).map(r => Number(r.id));
}

let runs = 0;
try {
  await fc.assert(fc.asyncProperty(filters, async f => {
    runs += 1;
    const want = await wantRequests(f);
    const got = await allPages(`/requests/nearby?${qs(params(f))}`, { limit: 100, family: 'property requests/nearby' });
    return got.status === 200 && sameSet(got.ids, want) && got.duplicates.length === 0 && got.total === want.length;
  }), { numRuns: Number(process.env.PROPERTY_RUNS || 150), seed: 496 });
  check(`property: requests/nearby = the database for ${runs} generated filter combinations`, true);
} catch (error) {
  check('property: requests/nearby = the database for every generated filter combination', false, String(error.message).split('\n').slice(0, 6).join(' | '));
}

const providers = (await sql(`SELECT u.id, pp.category_id, pp.service_ids, COALESCE(pp.coverage_city_id, u.city_id) AS home FROM users u JOIN provider_profiles pp ON pp.user_id = u.id
  WHERE u.role = 'provider' AND u.is_active = 1 AND u.is_blocked = 0 AND u.deleted_at IS NULL AND pp.hidden_at IS NULL`))
  .map(p => ({ id: Number(p.id), home: Number(p.home), cat: new Set([Number(p.category_id), ...(p.service_ids || []).map(s => catOfService[Number(s)])].filter(Boolean)) }));
const cover = new Map();
for (const r of await sql('SELECT pcd.user_id, d.city_id FROM provider_coverage_districts pcd JOIN districts d ON d.id = pcd.district_id')) cover.set(Number(r.user_id), [...(cover.get(Number(r.user_id)) || []), Number(r.city_id)]);
runs = 0;
try {
  await fc.assert(fc.asyncProperty(fc.record({ region_ids: subset(regions, 3), category_ids: subset(categories, 4) }), async f => {
    runs += 1;
    const want = providers.filter(p => {
      const cities = cover.get(p.id) || [p.home];
      const inRegion = !f.region_ids.length || cities.some(c => f.region_ids.includes(regionOfCity[c]));
      const inCategory = !f.category_ids.length || f.category_ids.some(c => p.cat.has(c));
      return inRegion && inCategory;
    }).map(p => p.id);
    const r = await api(`/providers/matching?${qs({ scope: 'all', region_ids: f.region_ids.join(','), category_ids: f.category_ids.join(',') })}`, { family: 'property providers/matching' });
    return sameSet((r.data?.providers || []).map(p => Number(p.id)), want);
  }), { numRuns: Number(process.env.PROPERTY_RUNS || 100), seed: 496 });
  check(`property: providers/matching = the database for ${runs} generated region/profession combinations`, true);
} catch (error) {
  check('property: providers/matching = the database for every generated combination', false, String(error.message).split('\n').slice(0, 6).join(' | '));
}
const bad = summary('API property');
saveReport('api-property');
await sql.end();
process.exit(bad.length ? 1 : 0);
