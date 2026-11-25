// AYK-500: an authorization probe. It lists every route the server really registers, calls each one
// (a) with no login, (b) as an ordinary requester, (c) as an ordinary provider, and reports which ones
// answer them with data. Run against the disposable stack (stack.cjs); it only sends GET requests, so it
// changes nothing. Routes that answer a visitor are printed for a human to confirm they are meant to be public.
//   AYK_TEST_PORT=55432 node e2e/filters/stack.cjs &   then   node e2e/filters/authz-probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(here, '.out/fixtures.json'), 'utf8'));
const BASE = `http://127.0.0.1:${process.env.FILTERS_PORT || 5055}`;

const routes = [];
const routesFile = path.join(here, '.out/routes.json');
if (fs.existsSync(routesFile)) routes.push(...JSON.parse(fs.readFileSync(routesFile, 'utf8')));
else { console.error('Missing .out/routes.json (the stack writes it when FILTERS_DUMP_ROUTES=1)'); process.exit(2); }

const tokens = { visitor: null, requester: fixtures.clients?.[0]?.token, provider: fixtures.providers?.[0]?.token };
const fill = p => p.replace(/:[A-Za-z_]+/g, '1').replace(/\(.*?\)/g, '');
const gets = [...new Map(routes.filter(r => r.method === 'GET').map(r => [fill(r.path), r])).values()];
const rows = [];
for (const r of gets) {
  const url = BASE + fill(r.path);
  const res = {};
  for (const [who, token] of Object.entries(tokens)) {
    if (who !== 'visitor' && !token) continue;
    try {
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      res[who] = response.status;
    } catch (e) { res[who] = 'ERR'; }
  }
  rows.push({ path: fill(r.path), ...res });
}
const open = rows.filter(r => r.visitor === 200);
const adminOpen = rows.filter(r => /\/admin\b|\/api\/admin/.test(r.path) && (r.visitor === 200 || r.requester === 200 || r.provider === 200));
const errors = rows.filter(r => [r.visitor, r.requester, r.provider].some(s => typeof s === 'number' && s >= 500 || s === 'ERR'));
console.log(`GET routes probed: ${rows.length}`);
console.log(`Answered a visitor with 200 (${open.length}) — confirm each is meant to be public:`);
for (const r of open) console.log('  ', r.path);
console.log(`Admin routes answering a visitor/requester/provider with 200: ${adminOpen.length}`);
for (const r of adminOpen) console.log('  ', JSON.stringify(r));
console.log(`Routes with a 5xx or network error: ${errors.length}`);
for (const r of errors) console.log('  ', JSON.stringify(r));
process.exit(adminOpen.length ? 1 : 0);
