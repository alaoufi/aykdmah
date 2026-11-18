// AYK-272: the waiting room. Over the limit, requests wait in line in order; a full line or a wait
// that runs out is answered 503 busy_queue with Retry-After; /health never waits; counts are kept.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createAdmission } = require('../middleware/admissionQueue');

async function serve(options) {
  const gate = createAdmission(options);
  const app = express();
  const holds = [];
  app.use('/api', gate.middleware);
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/slow/:n', (req, res) => holds.push(() => res.json({ n: Number(req.params.n), waited: res.getHeader('X-Queue-Wait-Ms') || null })));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { gate, holds, base, close: () => new Promise(r => server.close(r)) };
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

test('over the limit the rest wait in line, in order, and are served as places free up', async () => {
  const s = await serve({ maxActive: 2, maxWaiting: 10, maxWaitMs: 5000 });
  const order = [];
  const calls = [1, 2, 3, 4, 5].map(n => fetch(`${s.base}/slow/${n}`).then(r => r.json()).then(b => { order.push(b.n); return b; }));
  await tick();
  assert.equal(s.holds.length, 2);
  assert.deepEqual({ active: s.gate.snapshot().active, waiting: s.gate.snapshot().waiting }, { active: 2, waiting: 3 });
  assert.equal((await fetch(`${s.base}/health`)).status, 200); // never waits
  while (order.length < 5) { s.holds.shift()?.(); await tick(); }
  const done = await Promise.all(calls);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
  assert.ok(done.slice(2).every(b => b.waited !== null));
  const st = s.gate.snapshot();
  assert.equal(st.served, 5); assert.equal(st.waited, 3); assert.equal(st.longest_line, 3); assert.equal(st.refused, 0);
  await s.close();
});

test('a full line is refused at once with 503 busy_queue and Retry-After; a long wait too', async () => {
  const s = await serve({ maxActive: 1, maxWaiting: 2, maxWaitMs: 150 });
  const first = fetch(`${s.base}/slow/1`);
  await tick();
  const waiting = [fetch(`${s.base}/slow/2`), fetch(`${s.base}/slow/3`)];
  await tick();
  const refused = await fetch(`${s.base}/slow/4`);
  assert.equal(refused.status, 503);
  assert.equal(refused.headers.get('retry-after'), '2');
  assert.equal((await refused.json()).code, 'busy_queue');
  const late = await Promise.all(waiting);
  assert.deepEqual(late.map(r => r.status), [503, 503]); // waited 150 ms, then told to retry
  s.holds.shift()();
  assert.equal((await first).status, 200);
  const st = s.gate.snapshot();
  assert.equal(st.refused, 1); assert.equal(st.timed_out, 2); assert.equal(st.active, 0); assert.equal(st.waiting, 0);
  await s.close();
});

test('someone who leaves the line does not take a place', async () => {
  const s = await serve({ maxActive: 1, maxWaiting: 10, maxWaitMs: 5000 });
  const first = fetch(`${s.base}/slow/1`);
  await tick();
  const ctrl = new AbortController();
  const leaver = fetch(`${s.base}/slow/2`, { signal: ctrl.signal }).catch(() => 'left');
  const stayer = fetch(`${s.base}/slow/3`).then(r => r.json());
  await tick();
  ctrl.abort();
  assert.equal(await leaver, 'left');
  await tick();
  s.holds.shift()();
  await first;
  await tick();
  assert.equal(s.holds.length, 1); // the one who stayed, not the one who left
  s.holds.shift()();
  assert.equal((await stayer).n, 3);
  await s.close();
});
