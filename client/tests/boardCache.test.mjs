import test from 'node:test';
import assert from 'node:assert/strict';
import { boardKey, recall, keep, narrow } from '../src/utils/boardCache.js';

// AYK-449: the narrower list shows at once from the one on screen; a list asked for is kept.
test('narrow keeps the rows the ticked boxes allow', () => {
  const rows = [{ id: 1, board_profession: true, board_area: true }, { id: 2, board_area: true }, { id: 3, board_profession: true }, { id: 4 }];
  assert.deepEqual(narrow(rows, {}).map(r => r.id), [1, 2, 3, 4]);
  assert.deepEqual(narrow(rows, { prof: true }).map(r => r.id), [1, 3]);
  assert.deepEqual(narrow(rows, { area: true }).map(r => r.id), [1, 2]);
  assert.deepEqual(narrow(rows, { prof: true, area: true }).map(r => r.id), [1]);
});

test('a list is kept by its exact question', () => {
  const a = boardKey('requests', { board: '1', f_prof: '1' });
  assert.equal(a, boardKey('requests', { f_prof: '1', board: '1' }), 'order does not matter');
  assert.notEqual(a, boardKey('providers', { board: '1', f_prof: '1' }));
  assert.equal(recall(a), null);
  keep(a, { rows: [1] });
  assert.deepEqual(recall(a), { rows: [1] });
});
