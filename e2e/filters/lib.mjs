// AYK-496: shared helpers for the filter tests (API matrix and browser tests).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(here, '.out');
export const fixtures = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures.json'), 'utf8'));
export const BASE = process.env.FILTERS_BASE || `http://127.0.0.1:${fixtures.port}`;
const { Client } = createRequire(path.join(here, '..', '..', 'server', 'package.json'))('pg');

export async function connect() {
  const pg = new Client({ host: '127.0.0.1', port: Number(process.env.AYK_TEST_PORT || 55432), user: 'postgres', password: '', database: fixtures.database, ssl: false });
  await pg.connect();
  const sql = async (text, params = []) => (await pg.query(text, params)).rows;
  sql.end = () => pg.end();
  return sql;
}

// ---- results and timings ----
export const results = [];
export const timings = new Map(); // family -> [ms]
export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  if (!ok) console.log(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
}
export const failures = () => results.filter(r => !r.ok);
export function summary(title) {
  const bad = failures();
  console.log(`\n${title}: ${results.length - bad.length} passed, ${bad.length} failed`);
  return bad;
}
export function stats(family) {
  const list = [...(timings.get(family) || [])].sort((a, b) => a - b);
  if (!list.length) return null;
  const at = p => list[Math.min(list.length - 1, Math.floor(list.length * p))];
  return { family, n: list.length, p50: Math.round(at(0.5)), p95: Math.round(at(0.95)), max: Math.round(list[list.length - 1]) };
}
export function saveReport(name, extra = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const families = [...timings.keys()].map(stats);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failures().length, failures: failures(), timing: families, ...extra }, null, 2));
}

// ---- API ----
export async function api(route, { token, family = route.split('?')[0], method = 'GET', body, headers = {} } = {}) {
  const started = performance.now();
  const response = await fetch(`${BASE}/api${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  const ms = performance.now() - started;
  if (!timings.has(family)) timings.set(family, []);
  timings.get(family).push(ms);
  return { status: response.status, data: json.data, meta: json.meta, message: json.message, ms };
}

// Reads every page of a list; returns { ids, rows, total, pages, duplicates, ms }.
export async function allPages(route, { token, limit = 20, family, key = 'id', maxPages = 200 } = {}) {
  const rows = []; let total = null; let pages = 0; let ms = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const sep = route.includes('?') ? '&' : '?';
    const r = await api(`${route}${sep}page=${page}&limit=${limit}`, { token, family });
    ms += r.ms; pages += 1;
    if (r.status !== 200) return { status: r.status, message: r.message, rows, ids: [], total, pages, duplicates: [], ms };
    const list = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.providers || r.data?.requests || []);
    rows.push(...list);
    if (r.meta?.pagination) total = Number(r.meta.pagination.total);
    const more = r.meta?.pagination ? r.meta.pagination.hasNext : list.length >= limit;
    if (!more || !list.length) break;
  }
  const ids = rows.map(row => Number(row[key]));
  const seen = new Set(); const duplicates = [];
  for (const id of ids) { if (seen.has(id)) duplicates.push(id); seen.add(id); }
  return { status: 200, rows, ids, total, pages, duplicates, ms };
}

export const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every(id => new Set(b).has(id));
export function diff(actual, expected) {
  const A = new Set(actual), E = new Set(expected);
  return `missing ${[...E].filter(x => !A.has(x)).slice(0, 8).join(',') || '-'} | extra ${[...A].filter(x => !E.has(x)).slice(0, 8).join(',') || '-'} | got ${actual.length} want ${expected.length}`;
}
export function* combinations(dims) { // cartesian product of {name: [values]}
  const names = Object.keys(dims);
  function* walk(i, current) {
    if (i === names.length) { yield { ...current }; return; }
    for (const value of dims[names[i]]) { if (value !== undefined) current[names[i]] = value; else delete current[names[i]]; yield* walk(i + 1, current); }
  }
  yield* walk(0, {});
}
export const qs = params => Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
