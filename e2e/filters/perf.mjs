// AYK-496: response time of every list endpoint with varied filters on a large data set.
//   FILTERS_REQUESTS=6000 FILTERS_PROVIDERS=500 FILTERS_CLIENTS=300 node e2e/filters/stack.cjs   then   node e2e/filters/perf.mjs [label]
import fs from 'node:fs';
import path from 'node:path';
import { fixtures, api, timings, stats, OUT, qs } from './lib.mjs';

const label = process.argv[2] || 'run';
const N = Number(process.env.PERF_N || 40);
const pr = i => fixtures.providers[i % fixtures.providers.length], cl = i => fixtures.clients[i % fixtures.clients.length];
const cat = i => fixtures.categories[i % fixtures.categories.length], city = i => fixtures.cities[i % fixtures.cities.length];
const admin = { token: fixtures.adminToken, headers: { 'X-Ayk-Scope': 'admin' } };
const probes = {
  'requests/nearby (visitor, no filter)': i => ['/requests/nearby?limit=20&page=' + (1 + i % 5)],
  'requests/nearby (visitor, category+city)': i => [`/requests/nearby?${qs({ category_id: cat(i), city_id: city(i), limit: 20 })}`],
  'requests/nearby (visitor, regions+professions)': i => [`/requests/nearby?${qs({ region_ids: `${1 + i % 3},${2 + i % 4}`, category_ids: `${cat(i)},${cat(i + 2)}`, limit: 10 })}`],
  'requests/nearby (provider matching)': i => [`/requests/nearby?${qs({ matching: 1, scope: ['area', 'city', 'region', 'all', 'open'][i % 5], limit: 20 })}`, pr(i).token],
  'board (provider, f_prof+f_area)': i => [`/requests/nearby?${qs({ board: 1, matching: 1, f_prof: 1, f_area: i % 2 ? 1 : undefined, limit: 50 })}`, pr(i).token],
  'board (requester)': i => [`/requests/nearby?${qs({ board: 1, as: 'requester', f_prof: i % 2 ? 1 : undefined, limit: 30 })}`, cl(i).token],
  'requests/my': i => ['/requests/my?limit=20', cl(i).token],
  'requests/recent': i => ['/requests/recent?days=30&limit=20'],
  'providers/matching (area)': i => [`/providers/matching?${qs({ city_id: city(i), district_id: fixtures.districtsOf[city(i)][i % 8], scope: 'area', category_id: i % 2 ? cat(i) : undefined })}`],
  'providers/matching (all, regions+professions)': i => [`/providers/matching?${qs({ scope: 'all', region_ids: `${1 + i % 3},${2 + i % 4}`, category_ids: `${cat(i)},${cat(i + 3)}` })}`],
  'providers/matching (board)': i => [`/providers/matching?${qs({ board: 1, city_id: city(i), f_prof: 1, f_area: 1 })}`, cl(i).token],
  'providers/nearby (map)': i => [`/providers/nearby?${qs({ lat: 24.7 + (i % 5) * 0.1, lon: 46.6 + (i % 5) * 0.1, radius_km: [5, 25, 100][i % 3], category_id: i % 2 ? cat(i) : undefined })}`],
  'providers/area-stats': i => [`/providers/area-stats?${qs({ city_id: city(i), district_id: fixtures.districtsOf[city(i)][i % 8] })}`],
  'providers/my-market': i => ['/providers/my-market', pr(i).token],
  'chat/conversations': i => [`/chat/conversations?${qs({ archived: i % 2, limit: 20 })}`, i % 3 === 0 ? fixtures.clients[0].token : pr(i).token],
  'offers/my': i => ['/offers/my?limit=20', pr(i).token],
  'admin/requests (filters)': i => [`/admin/requests?${qs({ region_id: 1 + i % 3, category_id: cat(i), visibility: ['hidden', 'shown', undefined][i % 3], limit: 20 })}`, admin.token, admin.headers],
  'admin/requests (search)': i => [`/admin/requests?${qs({ search: ['طلب', 'خدمة', `${10 + i}`, 'مدينة'][i % 4], limit: 20 })}`, admin.token, admin.headers],
  'admin/providers (filters)': i => [`/admin/providers?${qs({ region_id: 1 + i % 3, category_id: cat(i), limit: 20 })}`, admin.token, admin.headers],
  'admin/providers (search)': i => [`/admin/providers?${qs({ search: ['مزود', `05600${i}`, 'ABC'][i % 3], limit: 20 })}`, admin.token, admin.headers],
  'users (admin search)': i => [`/users?${qs({ role: ['client', 'provider', undefined][i % 3], search: ['عميل', '0560', 'مزود'][i % 3], limit: 20 })}`, admin.token, admin.headers],
};
const rows = [];
for (const [name, make] of Object.entries(probes)) {
  for (let i = 0; i < N; i += 1) { const [route, token, headers] = make(i); const r = await api(route, { token, headers, family: name }); if (r.status >= 500) console.log('ERR', name, r.status); }
  rows.push(stats(name));
}
const slow = rows.filter(r => r.p95 > 200);
console.log(['endpoint', 'n', 'p50 ms', 'p95 ms', 'max ms'].join(' | '));
for (const r of rows) console.log([r.family, r.n, r.p50, r.p95, r.max].join(' | '));
console.log(`\nslower than 200 ms at p95: ${slow.map(r => `${r.family} (${r.p95})`).join(', ') || 'none'}`);
fs.writeFileSync(path.join(OUT, `perf-${label}.json`), JSON.stringify({ label, at: new Date().toISOString(), requests: fixtures.requests.length, providers: fixtures.providers.length, clients: fixtures.clients.length, rows }, null, 2));
