// AYK-366: «متاح» (the provider's own schedule) apart from «متواجد» (app open), with a weekly
// schedule of several periods a day, a different set for some days, and periods past midnight.
const test = require('node:test');
const assert = require('node:assert/strict');
const { availability, validateAvailability } = require('../utils/providerAvailability');

// 2026-11-15 is a Sunday; Saudi time is UTC+3.
const at = (dayOffset, hour, minute = 0) => new Date(Date.UTC(2026, 10, 15 + dayOffset, hour - 3, minute));
const week = { work_schedule: { 0: [['08:00', '12:00'], ['16:00', '22:00']], 5: [['20:00', '02:00']], 6: [['10:00', '24:00']] } };

test('several periods a day, days off, a period past midnight and one ending at midnight', () => {
  assert.equal(availability(week, at(0, 9)).state, 'available');
  assert.equal(availability(week, at(0, 13)).state, 'off_hours', 'between the two periods');
  assert.equal(availability(week, at(0, 17)).state, 'available', 'the second period');
  assert.equal(availability(week, at(1, 9)).state, 'off_day', 'Monday is not in the schedule');
  assert.equal(availability(week, at(5, 21)).state, 'available', 'Friday evening');
  assert.equal(availability(week, at(6, 1)).state, 'available', 'Friday\'s period runs into Saturday 01:00');
  assert.equal(availability(week, at(6, 3)).state, 'off_hours', 'Saturday 03:00: Friday\'s period ended, Saturday starts at 10');
  assert.equal(availability(week, at(6, 23, 59)).state, 'available', 'until midnight');
  assert.equal(availability({ ...week, work_schedule: JSON.stringify(week.work_schedule) }, at(0, 9)).state, 'available', 'stored as text');
});

test('24 hours, stopped, on leave, and the older single setting', () => {
  assert.equal(availability({}, at(2, 3)).state, 'available');
  assert.equal(availability({}, at(2, 3)).all_hours, true);
  assert.equal(availability({ availability_status: 'paused' }, at(0, 9)).state, 'paused');
  const leave = availability({ ...week, vacation_from: '2026-11-15', vacation_to: '2026-11-16' }, at(0, 9));
  assert.equal(leave.state, 'vacation'); assert.equal(leave.until, '2026-11-16');
  const old = { work_days: '0,1', work_from: '08:00', work_to: '17:00' };
  assert.equal(availability(old, at(0, 9)).state, 'available');
  assert.equal(availability(old, at(2, 9)).state, 'off_day');
  assert.deepEqual(availability(old, at(0, 9)).schedule[0], [['08:00', '17:00']]);
});

test('available is not present: the app being open is reported apart', () => {
  const away = availability({ is_online: 0 }, at(0, 9));
  assert.equal(away.state, 'available'); assert.equal(away.present, false);
  const here = availability({ availability_status: 'paused', is_online: 1 }, at(0, 9));
  assert.equal(here.state, 'paused'); assert.equal(here.present, true);
});

test('saving a schedule: checked, sorted, clears the older setting; null is 24 hours', () => {
  const saved = validateAvailability({ work_schedule: { 5: [['16:00', '22:00'], ['08:00', '12:00']] } });
  assert.equal(saved.work_schedule, JSON.stringify({ 5: [['08:00', '12:00'], ['16:00', '22:00']] }));
  assert.equal(saved.work_days, null); assert.equal(saved.work_from, null); assert.equal(saved.work_to, null);
  assert.deepEqual(validateAvailability({ work_schedule: null }), { work_schedule: null, work_days: null, work_from: null, work_to: null });
  for (const bad of [{ 7: [['08:00', '12:00']] }, { 0: [['08:00', '08:00']] }, { 0: [['8:00', '12:00']] }, { 0: [] }, [], 'x',
    { 0: Array(5).fill(['08:00', '09:00']) }]) {
    assert.throws(() => validateAvailability({ work_schedule: bad }), undefined, JSON.stringify(bad));
  }
  assert.equal(validateAvailability({ work_days: [0, 1], work_from: '08:00', work_to: '17:00' }).work_schedule, null, 'an older app\'s setting applies again');
});
