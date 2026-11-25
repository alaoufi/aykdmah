// AYK-497: property-based tests (fast-check): instead of a few chosen examples, thousands of generated ones, with the
// smallest failing case shown. They cover the rules the filters rest on: schedules and availability, search folding,
// phone numbers, LIKE escaping, text splitting, pagination checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { availability, localNow, validateAvailability } = require('../utils/providerAvailability');
const { foldText, phoneDigits, likeEscape } = require('../utils/searchFold');
const { splitText } = require('../services/translationService');
const Request = require('../models/Request');

const hhmm = fc.integer({ min: 0, max: 23 * 60 + 59 }).map(m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const toMin = t => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
const instant = fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 11, 31) }).map(ms => new Date(ms));

test('availability: a single daily period, even across midnight, matches a plain reference check at every minute', () => {
  fc.assert(fc.property(hhmm, hhmm, instant, (from, to, when) => {
    fc.pre(from !== to);
    const now = localNow(when);
    const a = toMin(from), b = toMin(to);
    const inside = a < b ? now.minutes >= a && now.minutes < b : now.minutes >= a || now.minutes < b;
    assert.equal(availability({ work_from: from, work_to: to }, when).state === 'available', inside);
  }), { numRuns: 2000 });
});

test('availability: paused beats vacation beats schedule; a vacation covers its first and last day; days off are off', () => {
  fc.assert(fc.property(instant, fc.integer({ min: 0, max: 6 }), (when, day) => {
    const now = localNow(when);
    assert.equal(availability({ availability_status: 'paused', vacation_from: '2000-01-01', vacation_to: '2099-12-31' }, when).state, 'paused');
    assert.equal(availability({ vacation_from: now.date, vacation_to: now.date }, when).state, 'vacation');
    const days = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== now.day).join(',');
    assert.equal(availability({ work_days: days }, when).state, 'off_day');
    assert.equal(availability({ work_days: String(now.day) }, when).state, 'available');
  }), { numRuns: 500 });
});

test('availability: with no schedule at all a provider is available at any time', () => {
  fc.assert(fc.property(instant, when => assert.equal(availability({}, when).state, 'available')), { numRuns: 300 });
});

test('weekly schedule: the saved periods validate and the state agrees with them', () => {
  const period = fc.tuple(hhmm, hhmm).filter(([a, b]) => a !== b);
  fc.assert(fc.property(fc.array(period, { minLength: 1, maxLength: 3 }), instant, (periods, when) => {
    const now = localNow(when);
    const schedule = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), periods]));
    const saved = validateAvailability({ work_schedule: schedule }, 'invalid');
    const inside = periods.some(([a, b]) => { const x = toMin(a), y = toMin(b); return x < y ? now.minutes >= x && now.minutes < y : now.minutes >= x || now.minutes < y; });
    assert.equal(availability({ work_schedule: saved.work_schedule }, when).state === 'available', inside);
  }), { numRuns: 800 });
});

test('search folding: idempotent, case-blind for Latin letters, and Arabic letter variants meet', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 40 }), text => assert.equal(foldText(foldText(text)), foldText(text))), { numRuns: 500 });
  fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9 ]{0,30}$/), text => assert.equal(foldText(text.toUpperCase()), foldText(text.toLowerCase()))), { numRuns: 500 });
  assert.equal(foldText('أحمد إبراهيم آمنة'), foldText('احمد ابراهيم امنه'));
});

test('phone search: every way of writing a Saudi mobile number gives the same digits', () => {
  fc.assert(fc.property(fc.integer({ min: 10000000, max: 99999999 }), n => {
    const local = `05${n}`, tail = `5${n}`;
    const writings = [local, `+966${tail}`, `00966${tail}`, `966${tail}`, `+966 ${tail.slice(0, 2)} ${tail.slice(2)}`, local.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])];
    for (const w of writings) assert.equal(phoneDigits(w), tail, w);
  }), { numRuns: 500 });
});

test('LIKE escaping: what the person types is always read as plain letters', () => {
  fc.assert(fc.property(fc.string({ maxLength: 30 }), text => {
    const escaped = likeEscape(text);
    // no «%», «_» or «\» is left without its backslash
    assert.doesNotMatch(escaped.replace(/\\[\\%_]/g, ''), /[\\%_]/);
    // and removing the backslashes gives the text back
    assert.equal(escaped.replace(/\\([\\%_])/g, '$1'), text);
  }), { numRuns: 1000 });
});

test('splitText: the pieces give the text back exactly and none is longer than allowed', () => {
  fc.assert(fc.property(fc.string({ maxLength: 400 }), fc.integer({ min: 20, max: 120 }), (text, size) => {
    const pieces = splitText(text, size);
    assert.equal(pieces.join(''), text);
    for (const piece of pieces) assert.ok(piece.length <= size);
  }), { numRuns: 500 });
});

test('pagination: valid pages and sizes pass through; anything else is refused, never clamped silently', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 1000000 }), fc.integer({ min: 1, max: 100 }), (page, limit) => {
    assert.deepEqual(Request.pagination(page, limit), { page, limit });
    assert.deepEqual(Request.pagination(String(page), String(limit)), { page, limit });
  }), { numRuns: 500 });
  fc.assert(fc.property(fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 101, max: 10 ** 7 }), fc.constant(NaN), fc.constant('abc')), bad => {
    assert.throws(() => Request.pagination(1, bad));
  }), { numRuns: 200 });
});
