import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizesForPlacements, sizeForPlacements, fitsSize, AD_SIZES, MAX_AD_VIDEO_SECONDS } from '../src/utils/adImageSize.js';

// AYK-421: an ad is checked against every frame it will show in, and a clip is short.
test('every frame the ad will appear in', () => {
  assert.deepEqual(sizesForPlacements(['home_top']).map(s => s.key), ['wide']);
  assert.deepEqual(sizesForPlacements(['sidebar']).map(s => s.key), ['narrow']);
  assert.deepEqual(sizesForPlacements(['home_top', 'sidebar']).map(s => s.key), ['wide', 'narrow']);
  assert.deepEqual(sizesForPlacements([]).map(s => s.key), ['wide']);
  assert.equal(sizeForPlacements(['home_top', 'sidebar']).key, 'wide');
});

test('a picture or clip fits only its frame shape, big enough', () => {
  assert.ok(fitsSize({ width: 1200, height: 400 }, AD_SIZES.wide));
  assert.ok(!fitsSize({ width: 800, height: 800 }, AD_SIZES.wide));
  assert.ok(!fitsSize({ width: 1200, height: 400 }, AD_SIZES.narrow), 'a wide one does not fit a side place: both must be shown');
  assert.ok(!fitsSize({ width: 600, height: 200 }, AD_SIZES.wide), 'too small');
  assert.equal(MAX_AD_VIDEO_SECONDS, 30);
});
