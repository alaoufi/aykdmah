import test from 'node:test';
import assert from 'node:assert/strict';
import { guidePageIndex, guidePageForHash } from '../src/utils/guideBook.js';

test('book bounds survive invalid input and empty chapters', () => {
  assert.equal(guidePageIndex(-1, 4), 0);
  assert.equal(guidePageIndex(12, 4), 3);
  assert.equal(guidePageIndex('bad', 4), 0);
  assert.equal(guidePageIndex(2, 0), 0);
});
test('book deep links select the chapter including nested headings', () => {
  assert.equal(guidePageForHash('#guide-calls-audio', ['guide-client', 'guide-calls']), 1);
  assert.equal(guidePageForHash('#unrelated', ['guide-client']), null);
});
