import test from 'node:test';
import assert from 'node:assert/strict';
import { createBurst, burstSummary } from '../src/utils/notifyBurst.js';

test('notifications arriving together are announced once, a later one separately', () => {
  const flushed = [];
  let run = null;
  const burst = createBurst(batch => flushed.push(batch), { setTimer: fn => { run = fn; return 1; }, clearTimer: () => { run = null; } });
  burst.add({ id: 1, type: 'new_message' }); burst.add({ id: 2, type: 'new_message' }); burst.add({ id: 3, type: 'new_message' });
  assert.equal(flushed.length, 0);
  run();
  assert.deepEqual(flushed.map(b => b.map(n => n.id)), [[1, 2, 3]]);
  burst.add({ id: 4, type: 'new_offer' });
  run();
  assert.deepEqual(flushed[1].map(n => n.id), [4]);
});

test('a stopped burst announces nothing', () => {
  const flushed = [];
  let run = null;
  const burst = createBurst(batch => flushed.push(batch), { setTimer: fn => { run = fn; return 1; }, clearTimer: () => { run = null; } });
  burst.add({ id: 1 });
  burst.stop();
  assert.equal(run, null);
  assert.equal(flushed.length, 0);
});

test('one banner: the notification itself when alone, a count otherwise', () => {
  const one = { id: 1, type: 'new_message' };
  assert.deepEqual(burstSummary([one]), { single: one });
  assert.deepEqual(burstSummary([one, { id: 2, type: 'new_message' }, { id: 3, type: 'new_message' }]), { key: 'notification.many_messages', count: 3 });
  assert.deepEqual(burstSummary([one, { id: 2, type: 'new_offer' }]), { key: 'notification.many_new', count: 2 });
});
