import test from 'node:test';
import assert from 'node:assert/strict';
import { createPollingLoop } from '../src/utils/polling.js';

function harness() {
  const listeners = new Set();
  const timers = new Map();
  let timerId = 0;
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_, cb) => listeners.add(cb),
    removeEventListener: (_, cb) => listeners.delete(cb),
  };
  return {
    options: {
      documentRef: doc,
      setTimer: (cb, ms) => { timers.set(++timerId, { cb, ms }); return timerId; },
      clearTimer: id => timers.delete(id),
    },
    timers,
    listeners,
    visibility(state) { doc.visibilityState = state; listeners.forEach(cb => cb()); },
    tick() { const [id, timer] = [...timers][0]; timers.delete(id); timer.cb(); },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('serial requests discard a response invalidated by a write and coalesce refreshes', async () => {
  const h = harness();
  const jobs = [];
  const results = [];
  const loop = createPollingLoop(() => {
    const job = deferred(); jobs.push(job); return job.promise;
  }, { ...h.options, intervalMs: 5000, onResult: value => results.push(value) });
  assert.equal(jobs.length, 1);
  loop.refresh(); loop.refresh();
  assert.equal(jobs.length, 1, 'a slow request must not overlap another request');
  jobs[0].resolve('outdated'); await flush();
  assert.deepEqual(results, []);
  assert.equal(jobs.length, 2, 'coalesced refresh runs after the first request settles');
  jobs[1].resolve('current'); await flush();
  assert.deepEqual(results, ['current']);
  assert.equal([...h.timers.values()][0].ms, 5000);
  h.tick(); assert.equal(jobs.length, 3);
  loop.stop(); jobs[2].resolve('after unmount'); await flush();
  assert.deepEqual(results, ['current']);
  assert.equal(h.timers.size, 0);
});

test('hidden tabs pause polling and reject any outstanding result', async () => {
  const h = harness(); const jobs = []; const results = [];
  const loop = createPollingLoop(() => {
    const job = deferred(); jobs.push(job); return job.promise;
  }, { ...h.options, onResult: value => results.push(value) });
  h.visibility('hidden'); jobs[0].resolve('hidden'); await flush();
  assert.deepEqual(results, []);
  assert.equal(h.timers.size, 0);
  loop.refresh(); assert.equal(jobs.length, 1);
  h.visibility('visible'); assert.equal(jobs.length, 2);
  jobs[1].resolve('visible'); await flush();
  assert.deepEqual(results, ['visible']);
  h.visibility('hidden'); assert.equal(h.timers.size, 0);
  loop.stop(); assert.equal(h.listeners.size, 0);
});

test('stopping waits for an in-flight upload and never reports late errors', async () => {
  const h = harness(); const job = deferred(); const errors = [];
  const loop = createPollingLoop(() => job.promise, { ...h.options, onError: e => errors.push(e) });
  let settled = false;
  const stopped = loop.stop().then(() => { settled = true; });
  await flush(); assert.equal(settled, false);
  job.reject(new Error('late')); await stopped;
  assert.equal(settled, true);
  assert.deepEqual(errors, []);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test('socket mode can use a one-time fetch with manual refresh and no timer', async () => {
  const h = harness(); let calls = 0; const results = [];
  const loop = createPollingLoop(async () => ++calls, {
    ...h.options, intervalMs: null, onResult: value => results.push(value),
  });
  await flush(); assert.deepEqual(results, [1]); assert.equal(h.timers.size, 0);
  await loop.refresh(); assert.deepEqual(results, [1, 2]); assert.equal(h.timers.size, 0);
  loop.stop();
});
