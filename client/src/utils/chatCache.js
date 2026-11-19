// The chat's own memory (AYK-231): the last view of each conversation, so opening it again shows
// it at once while the server is asked in the background, and the rules for combining what the
// server returns with what is already on screen.
const cache = new Map();
const MAX = 30;

export function cachedConversation(userId, conversationId) {
  const hit = cache.get(`${userId}:${conversationId}`);
  return hit || null;
}

export function cacheConversation(userId, conversationId, conv, messages) {
  const key = `${userId}:${conversationId}`;
  cache.delete(key);
  cache.set(key, { conv, messages: (messages || []).filter(m => !isTemporary(m)) });
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
}

export function clearChatCache() { cache.clear(); }

export const isTemporary = message => typeof message?.id === 'string' && message.id.startsWith('tmp-');

// The server's page of messages is the truth for the ids it covers. Kept from the screen: newer
// messages that came live after the server answered, and messages still being sent (or failed).
// A message being sent is dropped once the server has it (same sender and text).
export function mergeMessages(onScreen, fromServer, myId) {
  const server = [...(fromServer || [])];
  const maxId = server.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0);
  const ids = new Set(server.map(m => Number(m.id)));
  const newer = (onScreen || []).filter(m => !isTemporary(m) && Number(m.id) > maxId && !ids.has(Number(m.id)));
  const claimed = new Set();
  const temporary = (onScreen || []).filter(m => {
    if (!isTemporary(m)) return false;
    if (m.status === 'failed') return true;
    const match = server.find(s => !claimed.has(s.id) && Number(s.sender_id) === Number(myId)
      && (s.content || '') === (m.content || '') && !m.files_pending && Date.parse(s.created_at) >= Date.parse(m.created_at) - 120000);
    if (match) { claimed.add(match.id); return false; }
    return true;
  });
  return [...server, ...newer, ...temporary];
}

// Adds messages (a live one, or the ones after the last on screen) without duplicates. A message
// that carries the sender's own client_id replaces the bubble shown while it was being sent.
export function appendMessages(onScreen, incoming) {
  let list = [...(onScreen || [])];
  for (const message of incoming || []) {
    if (message.client_id) list = list.filter(m => !(isTemporary(m) && m.client_id === message.client_id));
    const at = list.findIndex(m => !isTemporary(m) && Number(m.id) === Number(message.id));
    if (at >= 0) list[at] = { ...list[at], ...message };
    else {
      const firstTemp = list.findIndex(isTemporary);
      if (firstTemp >= 0) list.splice(firstTemp, 0, message); else list.push(message);
    }
  }
  return list;
}

// A conversation row moved to the top with its new last message (no new request for the list).
export function updateConversationList(rows, message, { activeId, myId }) {
  const at = (rows || []).findIndex(row => Number(row.id) === Number(message.conversation_id));
  if (at < 0) return null;
  const row = rows[at];
  const mine = Number(message.sender_id) === Number(myId);
  const open = Number(activeId) === Number(message.conversation_id);
  let previous = row.last_message;
  if (typeof previous === 'string') { try { previous = JSON.parse(previous); } catch (_) { previous = null; } }
  const updated = {
    ...row,
    last_message: { ...(previous && typeof previous === 'object' ? previous : {}),
      id: message.id, content: message.content, message_type: message.message_type, created_at: message.created_at, sender_id: message.sender_id },
    last_message_at: message.created_at,
    unread_count: mine || open ? Number(row.unread_count) || 0 : (Number(row.unread_count) || 0) + 1,
  };
  // Favourites stay first (⭐, AYK-130): a plain chat moves to the top of the others.
  const rest = [...rows.slice(0, at), ...rows.slice(at + 1)];
  const favourite = row => Number(row.is_favorite) === 1;
  const place = favourite(updated) ? 0 : rest.filter(favourite).length;
  return [...rest.slice(0, place), updated, ...rest.slice(place)];
}
