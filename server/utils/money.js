'use strict';
// Money arithmetic without binary floating point (AYK-498, Decimal.js).
// Amounts are kept in halalas (integers); riyals are shown with two decimals.
const Decimal = require('decimal.js');

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

// "12.345" riyals -> 1235 halalas (half up). Bad input -> NaN so callers keep their own checks.
function toHalalas(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0; // as Number('') did
  try { return new Money(String(value).trim()).times(100).toDecimalPlaces(0).toNumber(); } catch (_) { return NaN; }
}
const toSar = halalas => new Money(halalas).dividedBy(100).toDecimalPlaces(2).toNumber();
// `percent` of an amount in halalas, rounded down (the platform never pays a fraction of a halala).
const percentOf = (halalas, percent) => new Money(halalas).times(new Money(String(percent))).dividedBy(100).floor().toNumber();

module.exports = { Money, toHalalas, toSar, percentOf };
