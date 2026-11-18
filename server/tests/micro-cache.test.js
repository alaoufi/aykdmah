// AYK-251: one database read for a crowd asking the same public question.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { microCache, _cache } = require('../middleware/microCache');

async function serve(run) {
  let reads = 0;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.lang = req.get('accept-language') || 'ar'; next(); });
  app.use('/api', microCache(1, ['/api/categories']), express.Router()
    .get('/categories', async (req, res) => { reads += 1; await new Promise(r => setTimeout(r, 40)); res.json({ data: [`قسم ${reads}`], all: req.query.all === 'true' }); })
    .get('/private', (req, res) => { reads += 1; res.json({ n: reads }); })
    .get('/categories/broken', (req, res) => res.status(500).json({}))
    .post('/admin/categories', (req, res) => res.json({ ok: true })));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try { await run(base, () => reads); } finally { _cache.clear(); await new Promise(r => server.close(r)); }
}
const get = (url, headers = {}) => fetch(url, { headers }).then(async r => ({ status: r.status, cache: r.headers.get('x-cache'), body: await r.json() }));

test('200 people at the same instant cause one read and all get the same answer', () => serve(async (base, reads) => {
  const answers = await Promise.all(Array.from({ length: 200 }, () => get(`${base}/categories`)));
  assert.strictEqual(reads(), 1);
  assert.ok(answers.every(a => a.status === 200 && a.body.data[0] === 'قسم 1'));
  assert.strictEqual((await get(`${base}/categories`)).cache, 'hit');
  assert.strictEqual(reads(), 1);
}));

test('kept per language, refreshed after its time, and never for other paths', () => serve(async (base, reads) => {
  await get(`${base}/categories`);
  await get(`${base}/categories`, { 'Accept-Language': 'hi' });
  assert.strictEqual(reads(), 2, 'another language is its own answer');
  await new Promise(r => setTimeout(r, 1100));
  assert.strictEqual((await get(`${base}/categories`)).body.data[0], 'قسم 3', 'a fresh read after the time passed');
  await get(`${base}/private`); await get(`${base}/private`);
  assert.strictEqual(reads(), 5, 'unlisted paths are never stored');
}));

test('admin screens and ?all=true bypass it; any change through the API clears it', () => serve(async (base, reads) => {
  await get(`${base}/categories`);
  assert.strictEqual((await get(`${base}/categories?all=true`)).body.all, true);
  await get(`${base}/categories`, { 'x-ayk-scope': 'admin' });
  assert.strictEqual(reads(), 3);
  await fetch(`${base}/admin/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual((await get(`${base}/categories`)).body.data[0], 'قسم 4', 'an edit shows at once');
}));
