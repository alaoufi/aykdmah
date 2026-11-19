import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages, appendMessages, updateConversationList, cacheConversation, cachedConversation } from '../src/utils/chatCache.js';

const at = s => new Date(Date.UTC(2026, 10, 14, 12, 0, s)).toISOString();
const msg = (id, sender = 2, content = `m${id}`, s = id) => ({ id, sender_id: sender, content, created_at: at(s) });

test('a poll never removes a message that came live after the server answered (AYK-231)', () => {
  const merged = mergeMessages([msg(1), msg(2), msg(3)], [msg(1), msg(2)], 1);
  assert.deepEqual(merged.map(m => m.id), [1, 2, 3]);
  // A deleted message (gone from the server's page) disappears.
  assert.deepEqual(mergeMessages([msg(1), msg(2), msg(3)], [msg(1), msg(3)], 1).map(m => m.id), [1, 3]);
});

test('a message being sent stays until the server has it, a failed one stays to retry', () => {
  const sending = { id: 'tmp-a', client_id: 'a', sender_id: 1, content: 'hello', created_at: at(10), status: 'pending' };
  const failed = { id: 'tmp-b', client_id: 'b', sender_id: 1, content: 'x', created_at: at(10), status: 'failed' };
  assert.deepEqual(mergeMessages([msg(1), sending, failed], [msg(1)], 1).map(m => m.id), [1, 'tmp-a', 'tmp-b']);
  assert.deepEqual(mergeMessages([msg(1), sending], [msg(1), msg(5, 1, 'hello', 11)], 1).map(m => m.id), [1, 5]);
});

test('the live copy replaces the sending bubble by client_id and is never added twice', () => {
  const sending = { id: 'tmp-a', client_id: 'a', sender_id: 1, content: 'hello', created_at: at(10), status: 'pending' };
  const list = appendMessages([msg(1), sending], [{ ...msg(7, 1, 'hello'), client_id: 'a' }]);
  assert.deepEqual(list.map(m => m.id), [1, 7]);
  assert.deepEqual(appendMessages(list, [msg(7, 1, 'hello')]).map(m => m.id), [1, 7]);
  // Someone else's message goes before my bubbles still being sent.
  assert.deepEqual(appendMessages([msg(1), sending], [msg(8)]).map(m => m.id), [1, 8, 'tmp-a']);
});

test('the chat list moves a conversation up with its last message, favourites first', () => {
  const rows = [{ id: 1, is_favorite: 1, unread_count: 0 }, { id: 2, unread_count: 0 }, { id: 3, unread_count: 2, last_message: '{"content":"old"}' }];
  const next = updateConversationList(rows, { conversation_id: 3, id: 9, sender_id: 2, content: 'new', created_at: at(1) }, { activeId: null, myId: 1 });
  assert.deepEqual(next.map(r => r.id), [1, 3, 2]);
  assert.equal(next[1].unread_count, 3);
  assert.equal(next[1].last_message.content, 'new');
  const open = updateConversationList(rows, { conversation_id: 3, id: 9, sender_id: 2, content: 'new', created_at: at(1) }, { activeId: 3, myId: 1 });
  assert.equal(open[1].unread_count, 2);
  assert.equal(updateConversationList(rows, { conversation_id: 99 }, { myId: 1 }), null);
});

test('a conversation is remembered per account, without unsent bubbles', () => {
  cacheConversation(1, 5, { id: 5 }, [msg(1), { id: 'tmp-x' }]);
  assert.deepEqual(cachedConversation(1, 5).messages.map(m => m.id), [1]);
  assert.equal(cachedConversation(2, 5), null);
});
