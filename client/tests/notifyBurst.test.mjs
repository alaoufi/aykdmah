import test from 'node:test';
import assert from 'node:assert/strict';
import { createBurst, burstSummary } from '../src/utils/notifyBurst.js';

function harness() {
  const flushed = [], timers = [];
  const burst = createBurst(batch => flushed.push(batch.map(n => n.id)), {
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => { timers.length = 0; } });
  const run = () => timers.shift().fn();
  return { burst, flushed, timers, run };
}

test('notifications arriving together are announced once', () => {
  const { burst, flushed, timers, run } = harness();
  burst.add({ id: 1 }); burst.add({ id: 2 }); burst.add({ id: 3 });
  assert.equal(flushed.length, 0);
  assert.equal(timers[0].ms, 400);
  run();
  assert.deepEqual(flushed, [[1, 2, 3]]);
});

test('a stream after an announcement is collected for the quiet time, then announced once', () => {
  const { burst, flushed, timers, run } = harness();
  burst.add({ id: 1 });
  run();                                   // announces [1], starts the quiet time
  assert.equal(timers[0].ms, 3000);
  for (let id = 2; id <= 20; id++) burst.add({ id });
  assert.equal(timers.length, 1);          // no extra timers while resting
  run();
  assert.equal(flushed.length, 2);
  assert.equal(flushed[1].length, 19);
  run();                                   // an empty quiet round ends the rest
  burst.add({ id: 21 });
  assert.equal(timers[0].ms, 400);         // back to the short wait
  run();
  assert.deepEqual(flushed[2], [21]);
});

test('a stopped burst announces nothing', () => {
  const { burst, flushed, timers } = harness();
  burst.add({ id: 1 });
  burst.stop();
  assert.equal(timers.length, 0);
  assert.equal(flushed.length, 0);
});

test('one banner: the notification itself when alone, a count with the right wording otherwise', () => {
  const message = id => ({ id, type: 'new_message' });
  const many = n => Array.from({ length: n }, (_, i) => message(i + 1));
  assert.deepEqual(burstSummary([message(1)]), { single: message(1) });
  assert.deepEqual(burstSummary(many(2)), { key: 'notification.pair_messages', count: 2 });
  assert.deepEqual(burstSummary(many(3)), { key: 'notification.few_messages', count: 3 });
  assert.deepEqual(burstSummary(many(10)), { key: 'notification.few_messages', count: 10 });
  assert.deepEqual(burstSummary(many(20)), { key: 'notification.lots_messages', count: 20 });
  assert.deepEqual(burstSummary([message(1), { id: 2, type: 'new_offer' }]), { key: 'notification.pair_new', count: 2 });
});
