'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeTask } = require('../runner.cjs');
const job = {id:'1e56db0d-c801-4cab-ab0f-aeacbbd445af', project:'aykdmah', text:'Inspect',acceptance:'Verify tests',requested:'codex'};
test('Claude handoff never invokes inference or falls through to Codex', async () => {
  assert.equal((await executeTask({...job,requested:'claude'})).status, 'paused');
});
test('blank acceptance or unrecognized provider does not dispatch', async () => {
  for (const invalid of [{acceptance:' '}, {requested:'auto'}, {requested:'claude-api'}]) {
    assert.equal((await executeTask({...job,...invalid})).status, 'needs-clarification');
  }
});
test('invalid project and path traversal fail before dispatch', async () => {
  await assert.rejects(executeTask({...job, project:'trbhh/../etc'}));
  await assert.rejects(executeTask({...job, id:'../secrets'}));
});

test('quota is recognized exclusively in a typed terminal failure', () => {
  const {quotaEvent} = require('../ops/quota.cjs');
  const message = "You've hit your usage limit. Try again later.";
  assert.equal(quotaEvent({type:'turn.failed', error:{message}}), true);
  assert.equal(quotaEvent({type:'turn.failed', error:{message:'connection timed out'}}), false);
  assert.equal(quotaEvent({type:'item.completed', item:{text:message}}), false);
  assert.equal(quotaEvent({type:'item.completed', error:{message}}), false);
});
