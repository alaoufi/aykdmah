const { query, queryOne, transaction } = require('../config/database');

// A request conversation is always its owner and one specific provider. An
// offer author may negotiate before selection; past offers retain only the
// history that was already shared with that author. Corrupt group membership
// fails closed instead of exposing a negotiation to an additional bidder.
function requestPairSql(participantAlias = 'cp', writable = false) {
  const offerStatus = writable ? "AND negotiation_offer.status = 'pending'" : '';
  const pairState = writable
    ? `(r.assigned_provider_id = provider_member.user_id
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
      AND ${requestPairSql('writable_member', true)}
      ${assignedOnly ? 'AND (c.request_id IS NULL OR r.assigned_provider_id IS NOT NULL)' : ''})`;
}

async function findOrCreateBetween(userA, userB, requestId = null) {
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
       LIMIT 1`,
      requestId ? [userA, userB, requestId] : [userA, userB]
    );
    if (existing.length) return existing[0].id;

    if (request) {
      const provider = users.find(user => Number(user.id) !== Number(request.client_id));
      if (provider.role !== 'provider' || !(Number(request.assigned_provider_id) === Number(provider.id)
          || (request.status === 'open' && request.assigned_provider_id == null && offer?.status === 'pending'))) {
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
    `SELECT u.id, u.full_name, u.avatar, u.is_online, u.last_seen_at, cp.last_read_at
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
      AND u.is_active = 1 AND u.is_blocked = 0 AND ${requestPairSql('cp', true)}`, [conversationId, userId]);
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
      AND u.is_active = 1 AND u.is_blocked = 0 AND ${requestPairSql('cp', true)}
    FOR SHARE OF cp, u`, [conversationId, userId]);
  if (!participant) throw Object.assign(new Error('Forbidden conversation'), { status: 403 });
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

async function listForUser(userId, { page = 1, limit = 20 } = {}) {
  page = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const offset = (page - 1) * limit;
  return query(
    `SELECT c.id, c.request_id, c.last_message_id, c.last_message_at, ${writableConversationSql()} AS can_send,
            ${writableConversationSql(true)} AS can_share_location,
            r.title AS request_title,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0 AND m.deleted_at IS NULL) AS unread_count,
            (SELECT JSON_OBJECT('id', u2.id, 'full_name', u2.full_name, 'avatar', u2.avatar, 'is_online', u2.is_online)
             FROM conversation_participants cp2
             JOIN users u2 ON cp2.user_id = u2.id
             WHERE cp2.conversation_id = c.id AND cp2.user_id != ? LIMIT 1) AS other_user,
            (SELECT JSON_OBJECT('content', m.content, 'message_type', m.message_type, 'created_at', m.created_at, 'sender_id', m.sender_id)
              FROM messages m WHERE m.id = c.last_message_id AND m.deleted_at IS NULL) AS last_message
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     JOIN users self_user ON self_user.id = cp.user_id
     LEFT JOIN requests r ON c.request_id = r.id
      WHERE cp.user_id = ? AND self_user.deleted_at IS NULL AND self_user.is_active = 1 AND self_user.is_blocked = 0
        AND ${requestPairSql()}
        -- The provider's side: a finished task leaves the list a day later (AYK-041).
        AND (r.id IS NULL OR NOT (r.client_id <> ? AND (r.status IN ('completed', 'closed', 'cancelled')
          OR (r.assigned_provider_id IS NOT NULL AND r.assigned_provider_id <> ?))
        AND COALESCE(r.completed_at, r.updated_at) < CURRENT_TIMESTAMP - INTERVAL '1 day'))
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, userId, userId, Number(limit), Number(offset)]
  );
}

// Unread messages in the chats the user can see, for the chat badge (the
// notification count belongs to the bell, not to "Chats").
async function unreadTotal(userId) {
  const rows = await listForUser(userId, { page: 1, limit: 100 });
  return rows.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0);
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
  findOrCreateBetween, findById, getParticipants, isParticipant, canSend, assertCanSend,
  canShareLocation, assertCanShareLocation, getContacts, listForUser, updateLastRead,
};
