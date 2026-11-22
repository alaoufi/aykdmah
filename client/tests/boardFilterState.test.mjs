import test from 'node:test';
import assert from 'node:assert/strict';
import { stateKey } from '../src/utils/boardFilterState.js';

// AYK-445: the line under «اعرض لي» says what the boxes show, or why one cannot work yet.
test('the line under the boxes follows the state', () => {
  const ok = { has_profession: true, has_area: true };
  assert.equal(stateKey({ prof: false, area: false }, true, ok), 'home.filter_none');
  assert.equal(stateKey({ prof: true, area: false }, true, ok), 'home.filter_state_prof_provider');
  assert.equal(stateKey({ prof: true, area: false }, false, ok), 'home.filter_state_prof_requester');
  assert.equal(stateKey({ prof: false, area: true }, false, ok), 'home.filter_state_area');
  assert.equal(stateKey({ prof: true, area: true }, true, ok), 'home.filter_state_both_provider');
  assert.equal(stateKey({ prof: true, area: true }, false, ok), 'home.filter_state_both_requester');
  assert.equal(stateKey({ prof: true, area: false }, true, { has_profession: false }), 'home.filter_need_services');
  assert.equal(stateKey({ prof: true, area: true }, false, { has_profession: false, has_area: true }), 'home.filter_need_requests');
  assert.equal(stateKey({ prof: false, area: true }, false, { has_profession: false, has_area: false }), 'home.filter_need_area');
  assert.equal(stateKey({ prof: false, area: false }, false, { has_profession: false }), 'home.filter_none', 'nothing chosen: no warning');
  assert.equal(stateKey({ prof: true, area: false }, true, null), 'home.filter_state_prof_provider', 'before the board answers');
});
