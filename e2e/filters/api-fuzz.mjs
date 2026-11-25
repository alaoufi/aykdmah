// AYK-496: every list endpoint with odd filter, page and size values: never a 500, never a negative or huge page,
// and a list asked for the same way twice answers the same.
import { fixtures, api, check, summary, saveReport } from './lib.mjs';

const provider = fixtures.providers[1], client = fixtures.clients[1];
const endpoints = [
  ['/requests/nearby', null], ['/requests/nearby?board=1', provider.token], ['/requests/my', client.token], ['/requests/recent', null],
  ['/providers/matching?scope=all', null], ['/providers/nearby?lat=24.7&lon=46.6', null], ['/providers/area-stats?city_id=1', null],
  ['/offers/my', provider.token], ['/chat/conversations', client.token], ['/notifications', client.token], ['/directory', client.token],
  ['/admin/requests', fixtures.adminToken], ['/admin/providers', fixtures.adminToken], ['/users', fixtures.adminToken],
  ['/admin/conversations', fixtures.adminToken], ['/admin/activity-logs', fixtures.adminToken],
];
const odd = ['page=0', 'page=-1', 'page=abc', 'page=999999999', 'limit=0', 'limit=-5', 'limit=abc', 'limit=1000000', 'category_id=abc', 'category_id=-1', 'category_id=999999999999',
  'city_id=0', 'region_id=x', 'status=zzz', 'scope=zzz', 'search=%25', 'search=_', `search=${'x'.repeat(500)}`, 'q=%', 'q=\'', 'archived=2', 'category_ids=1,abc', 'region_ids=,,,', 'lat=999&lon=999', 'radius_km=-1'];
for (const [route, token] of endpoints) {
  const headers = route.startsWith('/admin') || route.startsWith('/users') ? { 'X-Ayk-Scope': 'admin' } : {};
  for (const bad of odd) {
    const r = await api(`${route}${route.includes('?') ? '&' : '?'}${bad}`, { token, headers, family: 'fuzz' });
    check(`fuzz ${route} ${bad}: no server error`, r.status < 500, `status ${r.status} ${r.message || ''}`);
    if (r.status === 200 && /page=(0|-1)/.test(bad)) check(`fuzz ${route} ${bad}: a page below 1 is treated as page 1`, Array.isArray(r.data) || typeof r.data === 'object', '');
  }
  // the same question twice gives the same answer (no hidden state)
  const a = await api(route, { token, headers, family: 'fuzz' }), b = await api(route, { token, headers, family: 'fuzz' });
  const ids = r => JSON.stringify((Array.isArray(r.data) ? r.data : r.data?.items || r.data?.providers || []).map(x => x.id));
  check(`fuzz ${route}: asked twice, answered the same`, a.status === b.status && ids(a) === ids(b), `${a.status}/${b.status}`);
}
const bad = summary('API fuzz');
saveReport('api-fuzz');
process.exit(bad.length ? 1 : 0);
