const { query, queryOne, transaction } = require('../config/database');
const contactWindow = require('../utils/contactWindow');

// A request conversation is always its owner and one specific provider. An
// offer author may negotiate before selection; past offers retain only the
// history that was already shared with that author. Corrupt group membership
// fails closed instead of exposing a negotiation to an additional bidder.
function requestPairSql(participantAlias = 'cp', writable = false) {
  // A provider who withdrew can still talk while the request is open (AYK-112); a declined offer cannot.
  const offerStatus = writable ? "AND negotiation_offer.status IN ('pending', 'withdrawn')" : '';
  const pairState = writable
    ? `((r.assigned_provider_id = provider_member.user_id AND ${contactWindow.OPEN_SQL})
        OR (r.status = 'open' AND r.assigned_provider_id IS NULL AND EXISTS (
          SELECT 1 FROM offers negotiation_offer WHERE negotiation_offer.request_id = r.id
          AND negotiation_offer.provider_id = provider_member.user_id ${offerStatus})))`
    : `(r.assigned_provider_id = provider_member.user_id OR EXISTS (
        SELECT 1 FROM offers negotiation_offer WHERE negotiation_offer.request_id = r.id
        AND negotiation_offer.provider_id = provider_member.user_id))`;
  const availablePair = writable
    ? `AND owner_user.deleted_at IS NULL AND owner_user.is_active = 1 AND owner_user.is_blocked = 0
       AND provider_user.deleted_at IS NULL AND provider_user.is_active = 1 AND provider_user.is_blocked = 0
       AND provider_user.role = 'provider'` : '';
  return `(c.request_id IS NULL OR (r.id IS NOT NULL AND r.deleted_at IS NULL
    AND (SELECT COUNT(*) FROM conversation_participants pair_count WHERE pair_count.conversation_id = c.id) = 2
    AND EXISTS (
      SELECT 1 FROM conversation_participants owner_member
      JOIN conversation_participants provider_member ON provider_member.conversation_id = owner_member.conversation_id
        AND provider_member.user_id != owner_member.user_id
      JOIN users owner_user ON owner_user.id = owner_member.user_id
      JOIN users provider_user ON provider_user.id = provider_member.user_id
      WHERE owner_member.conversation_id = c.id AND owner_member.user_id = r.client_id
        AND ${participantAlias}.user_id IN (owner_member.user_id, provider_member.user_id)
        AND ${pairState} ${availablePair}
    )))`;
}

function writableConversationSql(assignedOnly = false) {
  return `EXISTS (SELECT 1 FROM conversation_participants writable_member
    JOIN users writable_user ON writable_user.id = writable_member.user_id
    WHERE writable_member.conversation_id = c.id AND writable_user.deleted_at IS NULL
      AND writable_user.is_active = 1 AND writable_user.is_blocked = 0
      AND ${requestPairSql('writable_member', true)} AND ${contactWindow.notBlockedSql('writable_member')}
      ${assignedOnly ? 'AND (c.request_id IS NULL OR r.assigned_provider_id IS NOT NULL)' : ''})`;
}

async function findOrCreateBetween(userA, userB, requestId = null, { fresh = false } = {}) {
  userA = Number(userA); userB = Number(userB);
  if (!Number.isSafeInteger(userA) || !Number.isSafeInteger(userB) || userA < 1 || userB < 1 || userA === userB
      || (requestId != null && (!Number.isSafeInteger(Number(requestId)) || Number(requestId) < 1))) {
    throw Object.assign(new Error('Invalid conversation participants'), { status: 400 });
  }
  requestId = requestId == null ? null : Number(requestId);
  return transaction(async (conn) => {
    const pair = [userA, userB].sort((a, b) => a - b);
    await conn.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`chat:${pair.join(':')}:${requestId || ''}`]);
    let request;
    let offer;
    if (requestId) {
      const [requests] = await conn.query('SELECT client_id, assigned_provider_id, status FROM requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [requestId]);
      request = requests[0];
      if (!request || !pair.includes(Number(request.client_id))) {
        throw Object.assign(new Error('Forbidden request conversation'), { status: 403 });
      }
      const providerId = pair.find(id => id !== Number(request.client_id));
      const [offers] = await conn.query('SELECT status FROM offers WHERE request_id = ? AND provider_id = ?', [requestId, providerId]);
      offer = offers[0];
      if (Number(request.assigned_provider_id) !== providerId && !offer) {
        throw Object.assign(new Error('Forbidden request conversation'), { status: 403 });
      }
    }
    const [users] = await conn.query('SELECT id, role FROM users WHERE id IN (?, ?) AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0 ORDER BY id FOR SHARE', pair);
    if (users.length !== 2) throw Object.assign(new Error('Conversation participant unavailable'), { status: 400 });
    const [existing] = await conn.query(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
       JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
       WHERE ${requestId ? 'c.request_id = ?' : 'c.request_id IS NULL'}
       AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) = 2
       ORDER BY c.id DESC LIMIT 1`,
      requestId ? [userA, userB, requestId] : [userA, userB]
    );
    if (existing.length && !fresh) return existing[0].id;
    if (fresh && existing.length) await assertCanSend(existing[0].id, userA, conn);

    if (request) {
      const provider = users.find(user => Number(user.id) !== Number(request.client_id));
      if (provider.role !== 'provider' || !(Number(request.assigned_provider_id) === Number(provider.id)
          || (request.status === 'open' && request.assigned_provider_id == null && ['pending','withdrawn'].includes(offer?.status)))) {
        throw Object.assign(new Error('Forbidden request conversation'), { status: 403 });
      }
    }
    const [result] = await conn.execute(
      'INSERT INTO conversations (request_id) VALUES (?)',
      [requestId]
    );
    const convId = result.insertId;
    await conn.query(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
      [convId, userA, convId, userB]
    );
    return convId;
  });
}

async function findById(id) {
  return queryOne(`SELECT c.*, ${writableConversationSql()} AS can_send,
    ${writableConversationSql(true)} AS can_share_location,
    r.client_id AS request_client_id, r.status AS request_status
    FROM conversations c LEFT JOIN requests r ON r.id = c.request_id WHERE c.id = ?`, [id]);
}

async function getParticipants(conversationId) {
  return query(
    `SELECT u.id, u.full_name, u.role, u.referral_code, u.avatar, CASE WHEN u.is_online = 1 OR u.last_seen_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 1 ELSE 0 END AS is_online, u.last_seen_at, cp.last_read_at
     FROM conversation_participants cp
     JOIN conversations c ON c.id = cp.conversation_id
     LEFT JOIN requests r ON r.id = c.request_id
     JOIN users u ON cp.user_id = u.id
     WHERE cp.conversation_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
       AND ${requestPairSql()}`,
    [conversationId]
  );
}

async function isParticipant(conversationId, userId) {
  const row = await queryOne(
    `SELECT cp.id FROM conversation_participants cp JOIN conversations c ON c.id = cp.conversation_id
     JOIN users u ON u.id = cp.user_id LEFT JOIN requests r ON r.id = c.request_id
     WHERE cp.conversation_id = ? AND cp.user_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
       AND ${requestPairSql()}`,
    [conversationId, userId]
  );
  return !!row;
}

async function canSend(conversationId, userId) {
  const row = await queryOne(`SELECT cp.id FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id JOIN users u ON u.id = cp.user_id
    LEFT JOIN requests r ON r.id = c.request_id
    WHERE cp.conversation_id = ? AND cp.user_id = ? AND u.deleted_at IS NULL
      AND u.is_active = 1 AND u.is_blocked = 0 AND ${requestPairSql('cp', true)} AND ${contactWindow.notBlockedSql('cp')}`, [conversationId, userId]);
  return !!row;
}

async function canShareLocation(conversationId, userId) {
  const row = await queryOne(`SELECT cp.id FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id JOIN users u ON u.id = cp.user_id
    LEFT JOIN requests r ON r.id = c.request_id
    WHERE cp.conversation_id = ? AND cp.user_id = ? AND u.deleted_at IS NULL
      AND u.is_active = 1 AND u.is_blocked = 0 AND ${requestPairSql('cp', true)}
      AND (c.request_id IS NULL OR r.assigned_provider_id IS NOT NULL)`, [conversationId, userId]);
  return !!row;
}

// Message persistence must run this on its own transaction connection. Lock the
// request before the conversation, just as offer acceptance/rejection does, so
// an acceptance cannot race with a previously authorized pending negotiation.
async function assertCanSend(conversationId, userId, conn) {
  const [[reference]] = await conn.query('SELECT request_id FROM conversations WHERE id = ?', [conversationId]);
  if (!reference) throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
  if (reference.request_id) {
    await conn.query('SELECT id FROM requests WHERE id = ? FOR SHARE', [reference.request_id]);
  }
  const [[locked]] = await conn.query('SELECT request_id FROM conversations WHERE id = ? FOR UPDATE', [conversationId]);
  if (!locked || locked.request_id !== reference.request_id) {
    throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
  }
  // A concurrent block, deletion or role change must finish before the fresh
  // authorization check. Hold both order parties until persistence commits;
  // ordinary unlinked chats retain their existing sender-only policy. Sorting
  // user ids keeps the pair's lock order stable across opposite-direction sends.
  await conn.query(`SELECT cp.id FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = ? ${reference.request_id ? '' : 'AND cp.user_id = ?'}
    ORDER BY u.id, cp.id FOR SHARE OF cp, u`, reference.request_id ? [conversationId] : [conversationId, userId]);
  const [[participant]] = await conn.query(`SELECT cp.id FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id JOIN users u ON u.id = cp.user_id
    LEFT JOIN requests r ON r.id = c.request_id
    WHERE cp.conversation_id = ? AND cp.user_id = ? AND u.deleted_at IS NULL
      AND u.is_active = 1 AND u.is_blocked = 0 AND ${requestPairSql('cp', true)} AND ${contactWindow.notBlockedSql('cp')}
    FOR SHARE OF cp, u`, [conversationId, userId]);
  if (!participant) throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
  return true;
}

// Freeze readable source membership and request state for a forwarding copy.
// This intentionally uses the historical read policy, not the send window.
async function assertCanRead(conversationId,userId,conn) {
  const [[reference]]=await conn.query('SELECT request_id FROM conversations WHERE id = ?',[conversationId]);
  if(!reference)throw Object.assign(new Error('Forbidden conversation'),{status:403});
  if(reference.request_id)await conn.query('SELECT id FROM requests WHERE id = ? FOR SHARE',[reference.request_id]);
  // Share-lock participants/users rather than the conversation row: opposing
  // forwards may update each other's target rows without lock-upgrade cycles.
  await conn.query(`SELECT cp.id FROM conversation_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = ? ORDER BY u.id,cp.id FOR SHARE OF cp,u`,[conversationId]);
  const [[reader]]=await conn.query(`SELECT reader.id FROM conversation_participants reader
    JOIN conversations c ON c.id = reader.conversation_id JOIN users u ON u.id = reader.user_id
    LEFT JOIN requests r ON r.id = c.request_id
    WHERE reader.conversation_id = ? AND reader.user_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
      AND ${requestPairSql('reader')} FOR SHARE OF reader,u`,[conversationId,userId]);
  if(!reader)throw Object.assign(new Error('Forbidden conversation'),{status:403});
  return true;
}

// Live GPS requires the selected order pair. A pending offer permits messages,
// but does not authorize sharing the owner's point with its bidder.
async function assertCanShareLocation(conversationId, userId, conn) {
  await assertCanSend(conversationId, userId, conn);
  const [[eligible]] = await conn.query(`SELECT c.id FROM conversations c
    LEFT JOIN requests r ON r.id = c.request_id WHERE c.id = ?
      AND (c.request_id IS NULL OR r.assigned_provider_id IS NOT NULL)`, [conversationId]);
  if (!eligible) throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
  return true;
}

async function getContacts(userId) {
  return query(`SELECT DISTINCT other.user_id AS id FROM conversation_participants self
    JOIN conversation_participants other ON other.conversation_id = self.conversation_id AND other.user_id != self.user_id
    JOIN conversations c ON c.id = self.conversation_id LEFT JOIN requests r ON r.id = c.request_id
    JOIN users u ON u.id = other.user_id
    WHERE self.user_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0
      AND ${requestPairSql('self')} AND ${requestPairSql('other')}`, [userId]);
}

async function listRows(userId, { page = 1, limit = 20, q = '', requestId = null, peerId = null, maxLimit = 100, withMessagesOnly = false } = {}) {
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(maxLimit, Number.parseInt(limit, 10) || 20));
  const offset = (page - 1) * limit;
  const extra = [], extraParams = [];
  // «Delete for me» (message_hidden) hides a message from this reader everywhere: the list, the preview, the count.
  const unhidden = alias => `NOT EXISTS (SELECT 1 FROM message_hidden mh WHERE mh.message_id = ${alias}.id AND mh.user_id = ${Number(userId)})`;
  if (requestId) { extra.push('c.request_id = ?'); extraParams.push(Number(requestId)); }
  // AYK-423 (the owner: «في المحادثات أسماء بدون محادثات… إذا ما فيه محادثات ما تفتح محادثة فارغة»):
  // the chat list shows only conversations with at least one message; an opened but empty one
  // appears once someone writes in it.
  if (withMessagesOnly) extra.push(`EXISTS (SELECT 1 FROM messages any_message WHERE any_message.conversation_id = c.id AND any_message.deleted_at IS NULL AND ${unhidden('any_message')})`);
  if (peerId) { extra.push('EXISTS (SELECT 1 FROM conversation_participants peer WHERE peer.conversation_id = c.id AND peer.user_id = ?)'); extraParams.push(Number(peerId)); }
  if (q) {
    extra.push(`(r.title ILIKE ? OR EXISTS (SELECT 1 FROM messages matched_message WHERE matched_message.conversation_id = c.id AND matched_message.deleted_at IS NULL AND ${unhidden('matched_message')} AND matched_message.content ILIKE ?) OR EXISTS (SELECT 1 FROM conversation_participants peer JOIN users person ON person.id = peer.user_id
      LEFT JOIN saved_providers saved ON saved.user_id = cp.user_id AND saved.provider_id = person.id
      WHERE peer.conversation_id = c.id AND peer.user_id <> cp.user_id AND
      (person.referral_code ILIKE ? OR saved.nickname ILIKE ? OR (person.role <> 'client' AND person.full_name ILIKE ?))))`);
    extraParams.push(...Array(5).fill(`%${q}%`));
  }
  return query(
    `SELECT c.id, c.request_id, c.last_message_id, c.last_message_at, ${writableConversationSql()} AS can_send,
            COALESCE(cp.is_favorite, 0) AS is_favorite,
            ${writableConversationSql(true)} AS can_share_location,
            r.title AS request_title, r.status AS request_status,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0 AND m.deleted_at IS NULL AND ${unhidden('m')}) AS unread_count,
            (SELECT JSON_OBJECT('id', u2.id, 'full_name', u2.full_name, 'avatar', u2.avatar, 'is_online', CASE WHEN u2.is_online = 1 OR u2.last_seen_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 1 ELSE 0 END, 'last_seen_at', u2.last_seen_at, 'referral_code', u2.referral_code, 'role', u2.role)
             FROM conversation_participants cp2
             JOIN users u2 ON cp2.user_id = u2.id
             WHERE cp2.conversation_id = c.id AND cp2.user_id != ? LIMIT 1) AS other_user,
            (SELECT JSON_OBJECT('content', m.content, 'message_type', m.message_type, 'created_at', m.created_at, 'sender_id', m.sender_id)
              FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND ${unhidden('m')} ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     JOIN users self_user ON self_user.id = cp.user_id
     LEFT JOIN requests r ON c.request_id = r.id
      WHERE cp.user_id = ? AND self_user.deleted_at IS NULL AND self_user.is_active = 1 AND self_user.is_blocked = 0
        AND ${requestPairSql()}
        -- The provider's side: a task given to someone else leaves the list a day later (AYK-041);
        -- a finished one stays while its two sides can still write (AYK-081).
        AND (r.id IS NULL OR r.client_id = ? OR NOT (
          ((r.assigned_provider_id IS NOT NULL AND r.assigned_provider_id <> ?)
            AND COALESCE(r.completed_at, r.updated_at) < CURRENT_TIMESTAMP - INTERVAL '1 day')
          OR NOT ${contactWindow.OPEN_SQL}))
     ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
     ORDER BY COALESCE(cp.is_favorite, 0) DESC, c.last_message_at DESC NULLS LAST, c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, userId, userId, ...extraParams, Number(limit), Number(offset)]
  );
}

// AYK-365 (the owner: «ادمجها محادثة واحدة لكل شخصين»): the chat list shows one row per person,
// like WhatsApp. The conversations stay as they are (each tied to its request, its rights, reviews
// and disputes); the row stands for all of them: the newest message, the unread count of all, and
// `pair_ids`. Its id is the conversation one writes to: the newest that can still be written to.
const otherOf = row => {
  let other = row.other_user;
  if (typeof other === 'string') { try { other = JSON.parse(other); } catch (_) { other = null; } }
  return other && other.id != null ? Number(other.id) : null;
};
async function listForUser(userId, { page = 1, limit = 20, q = '', requestId = null, peerId = null, merge = true, withMessagesOnly = false, archived = null } = {}) {
  if (!merge || requestId) return listRows(userId, { page, limit, q, requestId, peerId, withMessagesOnly });
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const rows = await listRows(userId, { page: 1, limit: 1000, q, peerId, maxLimit: 1000, withMessagesOnly });
  const groups = new Map();
  for (const row of rows) {
    const key = otherOf(row) ?? `c${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const merged = [...groups.values()].map(list => {
    const newest = [...list].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))[0];
    const writable = row => Number(row.can_send) === 1 || row.can_send === true;
    // The chat list's archive (finished or closed requests): the person's row is archived only
    // when every conversation with them is.
    const archived = row => Boolean(row.request_id) && (!writable(row) || ['completed', 'closed', 'cancelled'].includes(row.request_status));
    const target = list.find(row => writable(row) && !archived(row)) || list.find(writable) || newest;
    return {
      ...target,
      archived: list.every(archived),
      last_message: newest.last_message,
      last_message_at: newest.last_message_at,
      unread_count: list.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0),
      is_favorite: list.some(row => Number(row.is_favorite) === 1) ? 1 : 0,
      pair_ids: list.map(row => Number(row.id)),
      requests_count: list.filter(row => row.request_id).length,
    };
  });
  merged.sort((a, b) => (b.is_favorite - a.is_favorite) || (new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)) || (b.id - a.id));
  // The chat list's «active» and «archive» tabs are cut here, before the page, so each page of a tab is full.
  const tab = archived === null ? merged : merged.filter(row => row.archived === archived);
  return tab.slice((page - 1) * limit, page * limit);
}

// AYK-365: every conversation this user can open with the other person of `conversationId`
// (`conversationId` itself first), so one chat shows all their messages.
async function pairIds(conversationId, userId) {
  const id = Number(conversationId);
  const rows = await query(`SELECT DISTINCT mine.conversation_id AS id FROM conversation_participants mine
    JOIN conversation_participants theirs ON theirs.conversation_id = mine.conversation_id AND theirs.user_id <> mine.user_id
    WHERE mine.user_id = ? AND theirs.user_id = (SELECT MIN(p.user_id) FROM conversation_participants p WHERE p.conversation_id = ? AND p.user_id <> ?)`,
  [userId, id, userId]);
  const ids = [id];
  for (const row of rows) {
    const other = Number(row.id);
    if (other !== id && await isParticipant(other, userId)) ids.push(other);
  }
  return ids;
}

// Unread messages in the chats the user can see, for the chat badge (the
// notification count belongs to the bell, not to "Chats").
async function unreadTotal(userId) {
  // AYK-251: asked every time the app opens. Most people have nothing unread; one small indexed
  // look-up answers that without building the whole chat list (3.5 ms of database processor).
  const any = await queryOne(`SELECT 1 AS found FROM conversation_participants cp
    JOIN messages m ON m.conversation_id = cp.conversation_id
    WHERE cp.user_id = ? AND m.is_read = 0 AND m.sender_id != ? AND m.deleted_at IS NULL LIMIT 1`, [userId, userId]);
  if (!any) return 0;
  const rows = await listRows(userId, { page: 1, limit: 1000, maxLimit: 1000 });
  return rows.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0);
}

// ⭐ A favourite conversation (AYK-130): for this user only, kept at the top of their list.
async function setFavorite(conversationId, userId, favorite) {
  await query('UPDATE conversation_participants SET is_favorite = ? WHERE conversation_id = ? AND user_id = ?',
    [favorite ? 1 : 0, conversationId, userId]);
}

async function updateLastRead(conversationId, userId) {
  await query(
    'UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  );
  await query(
    'UPDATE messages SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
    [conversationId, userId]
  );
}

module.exports = {
  unreadTotal,
  findOrCreateBetween, findById, getParticipants, isParticipant, canSend, assertCanSend, assertCanRead,
  canShareLocation, assertCanShareLocation, getContacts, listForUser, listRows, pairIds, updateLastRead, setFavorite,
};
