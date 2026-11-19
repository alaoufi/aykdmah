import test from 'node:test';import assert from 'node:assert/strict';
import { createForwardBatchOwner } from '../src/utils/forwardBatch.js';
test('a different message batch owns fresh state and a late completion cannot close it',()=>{
  const owner=createForwardBatchOwner(),a=owner.open('1:10',[102,101]),b=owner.open('1:10',[103]);
  assert.match(a.key,/forward:1:10:101,102:/);assert.notEqual(a.key,b.key);
  assert.equal(owner.close(a),false);assert.equal(owner.isCurrent(b),true);
  const aAgain=owner.open('1:10',[101,102]);
  assert.notEqual(aAgain.key,a.key);assert.equal(owner.close(a),false);assert.equal(owner.isCurrent(aAgain),true);
  owner.close();assert.equal(owner.isCurrent(aAgain),false);
});
