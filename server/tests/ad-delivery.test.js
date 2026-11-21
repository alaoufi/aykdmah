// AYK-409: the professional delivery rules — schedule in Saudi time, targeting, priority and weight.
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../services/adDelivery');

// 2026-11-22 is a Sunday; 07:30 UTC is 10:30 in Saudi Arabia.
const sunday1030 = new Date('2026-11-22T07:30:00Z');

test('schedule: days and hours in Saudi time, a window past midnight wraps', () => {
  assert.equal(d.inSchedule(null, sunday1030), true);
  assert.equal(d.inSchedule({ days: [0], from: '10:00', to: '11:00' }, sunday1030), true);
  assert.equal(d.inSchedule({ days: [1, 2] }, sunday1030), false, 'not on Sunday');
  assert.equal(d.inSchedule({ from: '11:00', to: '14:00' }, sunday1030), false, 'too early');
  assert.equal(d.inSchedule({ from: '20:00', to: '11:00' }, sunday1030), true, 'night window wraps');
  assert.equal(d.inSchedule({ from: '20:00', to: '02:00' }, sunday1030), false);
});

test('targeting by device, language and audience', () => {
  const ctx = d.contextOf({ query: { device: 'mobile', lang: 'ur' }, headers: {}, user: { role: 'provider' } });
  assert.deepEqual(ctx, { device: 'mobile', lang: 'ur', audience: 'provider' });
  assert.equal(d.contextOf({ query: {}, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile' } }).device, 'mobile');
  assert.equal(d.contextOf({ query: {}, headers: {} }).audience, 'guest');
  assert.equal(d.matchesContext({}, ctx), true, 'no targeting: everyone');
  assert.equal(d.matchesContext({ target_devices: ['desktop'] }, ctx), false);
  assert.equal(d.matchesContext({ target_langs: ['ar', 'ur'], target_audience: ['provider'] }, ctx), true);
  assert.equal(d.matchesContext({ target_audience: ['guest', 'client'] }, ctx), false);
});

test('priority first, then weight decides how often an ad comes first', () => {
  const ads = [{ id: 'fallback', priority: 3, weight: 10 }, { id: 'normal', priority: 2, weight: 1 }, { id: 'high', priority: 1, weight: 1 }];
  for (let i = 0; i < 20; i++) assert.deepEqual(d.order(ads).map(a => a.id), ['high', 'normal', 'fallback']);
  let heavyFirst = 0;
  const pair = [{ id: 'a', priority: 2, weight: 3 }, { id: 'b', priority: 2, weight: 1 }];
  for (let i = 0; i < 4000; i++) if (d.order(pair)[0].id === 'a') heavyFirst++;
  // Weight 3 against 1: first about 75% of the time.
  assert.ok(heavyFirst > 2800 && heavyFirst < 3200, `weight 3 first ${heavyFirst}/4000`);
});
