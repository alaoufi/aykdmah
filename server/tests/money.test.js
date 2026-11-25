// AYK-498: money arithmetic with Decimal.js against the old floating-point formulas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { toHalalas, toSar, percentOf } = require('../utils/money');

const oldHalalas = v => Math.round(Number(v) * 100);
const oldPercent = (h, p) => Math.floor(h * p / 100);
// exact reference with BigInt: floor(h * p / 100) where p has up to 2 decimals
const exactPercent = (h, p) => Number((BigInt(h) * BigInt(Math.round(p * 100))) / 10000n);

test('toHalalas: two-decimal riyal strings convert exactly and round trip through toSar', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 100000000 }), cents => {
    const text = (cents / 100).toFixed(2);
    assert.equal(toHalalas(text), cents);
    assert.equal(toSar(cents), Number(text));
  }), { numRuns: 5000 });
});

test('toHalalas: half halala rounds up, empty is zero, junk is NaN', () => {
  assert.equal(toHalalas('1.005'), 101);
  assert.equal(toHalalas('0.004'), 0);
  assert.equal(toHalalas(''), 0);
  assert.equal(toHalalas(null), 0);
  assert.ok(Number.isNaN(toHalalas('abc')));
});

test('percentOf: equals the exact integer result for every amount and two-decimal percent', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 100000000 }), fc.integer({ min: 0, max: 10000 }), (h, pc) => {
    const p = pc / 100;
    assert.equal(percentOf(h, p), exactPercent(h, p));
  }), { numRuns: 20000 });
});

test('percentOf: how often the old floating-point formula differed from the exact one (measured, printed)', () => {
  let wrong = 0;
  for (let h = 1; h <= 20000; h += 1) for (const p of [7, 10, 12.5, 15, 17.5, 29, 33.33]) {
    if (oldPercent(h, p) !== exactPercent(h, p)) wrong += 1;
  }
  console.log(`old formula differed from the exact one on ${wrong} of ${20000 * 7} sampled cases`);
  assert.ok(wrong >= 0);
});

test('toHalalas: old and new agree on ordinary two-decimal amounts', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 100000000 }), cents => {
    const text = (cents / 100).toFixed(2);
    assert.equal(toHalalas(text), oldHalalas(text));
  }), { numRuns: 5000 });
});
