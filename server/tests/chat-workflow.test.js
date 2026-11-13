const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../utils/chatMessageValidation');

test('search accepts bounded plain text and rejects structured or oversized queries', () => {
  assert.equal(typeof validation.searchQuery, 'function');
  assert.equal(validation.searchQuery('  سباك  '), 'سباك');
  assert.equal(validation.searchQuery(), '');
  for (const bad of [[], {}, ['secret'], 'a'.repeat(201)]) assert.throws(() => validation.searchQuery(bad), { status: 400 });
});

test('forward selection is explicit, bounded, unique and excludes private message types', () => {
  assert.equal(typeof validation.forwardSelection, 'function');
  assert.deepEqual(validation.forwardSelection({ message_ids: [3, 1, 3], conversation_ids: [8, 8, 9] }), { messageIds: [3, 1], targetIds: [8, 9] });
  for (const body of [{}, { message_ids: [], conversation_ids: [1] }, { message_ids: [1], conversation_ids: [] }, { message_ids: [1], conversation_ids: [0] }, { message_ids: Array.from({length: 21}, (_, i) => i + 1), conversation_ids: [1] }]) assert.throws(() => validation.forwardSelection(body), { status: 400 });
  assert.equal(validation.canForward({ sender_id: 5, message_type: 'voice' }, 5), true);
  for (const message of [{sender_id: 4, message_type:'text'}, {sender_id:5, message_type:'system'}, {sender_id:5, message_type:'location'}, {sender_id:5, message_type:'text', deleted_at:'today'}]) assert.equal(validation.canForward(message, 5), false);
});

test('forward operation IDs require a bounded UUID and normalize case',()=>{
  assert.equal(validation.forwardOperationId('12345678-1234-4234-8234-123456789ABC'),'12345678-1234-4234-8234-123456789abc');
  for(const value of [undefined,[],{},'short','x'.repeat(200)])assert.throws(()=>validation.forwardOperationId(value),{status:400});
});
