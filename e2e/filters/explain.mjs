// AYK-497: EXPLAIN (ANALYZE, BUFFERS) on the slowest statements the application ran during a test or a perf run.
//   SQL_TRACE=1 SQL_TRACE_FILE=/tmp/sql.jsonl AYK_TEST_PORT=55432 node e2e/filters/stack.cjs     (then run the tests / perf.mjs)
//   node e2e/filters/explain.mjs /tmp/sql.jsonl [top=15] [minMs=5]
// Only SELECT / WITH statements are explained: EXPLAIN ANALYZE really runs the statement, so nothing that writes is ever replayed.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, connect } from './lib.mjs';

const file = process.argv[2] || process.env.SQL_TRACE_FILE;
if (!file || !fs.existsSync(file)) { console.error('Give the trace file written with SQL_TRACE_FILE.'); process.exit(1); }
const top = Number(process.argv[3] || 15), minMs = Number(process.argv[4] || 5);
const key = text => text.replace(/\s+/g, ' ').trim();
const groups = new Map();
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  let row; try { row = JSON.parse(line); } catch (_) { continue; }
  if (!/^\s*(SELECT|WITH)\b/i.test(row.text)) continue;
  const k = key(row.text);
  const g = groups.get(k) || { text: row.text, calls: 0, total: 0, max: 0, slowest: null };
  g.calls += 1; g.total += row.ms;
  if (row.ms >= g.max) { g.max = row.ms; g.slowest = row.values; }
  groups.set(k, g);
}
const slow = [...groups.values()].filter(g => g.max >= minMs).sort((a, b) => b.max - a.max).slice(0, top);
const sql = await connect();
const report = [];
for (const [index, g] of slow.entries()) {
  let plan = '';
  try { plan = (await sql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${g.text}`, g.slowest)).map(r => r['QUERY PLAN']).join('\n'); }
  catch (error) { plan = `could not explain: ${error.message}`; }
  const total = Number((plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] || 0);
  const seq = [...plan.matchAll(/Seq Scan on (\w+)[^\n]*rows=(\d+)[^\n]*\n(?:[^\n]*\n)*?[^\n]*Rows Removed by Filter: (\d+)/g)].map(m => ({ table: m[1], rows: Number(m[2]), removed: Number(m[3]) }))
    .filter(s => s.rows + s.removed >= 1000);
  report.push({ rank: index + 1, calls: g.calls, avgMs: +(g.total / g.calls).toFixed(1), maxMs: +g.max.toFixed(1), executionMs: total, bigSeqScans: seq, statement: key(g.text).slice(0, 220), plan });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'explain.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'explain.txt'), report.map(r => `#${r.rank} calls=${r.calls} avg=${r.avgMs}ms max=${r.maxMs}ms exec=${r.executionMs}ms\n${r.statement}\n${r.plan}\n`).join('\n----------------------------------------\n'));
console.log('rank | calls | avg ms | max ms | explain ms | table scans of 1000+ rows | statement');
for (const r of report) console.log([r.rank, r.calls, r.avgMs, r.maxMs, r.executionMs, r.bigSeqScans.map(s => `${s.table}(${s.rows + s.removed})`).join(',') || '-', r.statement.slice(0, 90)].join(' | '));
await sql.end();
