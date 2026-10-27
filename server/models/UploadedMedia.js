const { randomUUID } = require('crypto');
const { query, queryOne, transaction } = require('../config/database');
const { validateUpload } = require('../utils/uploadValidation');
const Conversation = require('./Conversation');

async function createBatch(files, { ownerId, scope, scopeId = null }) {
  return transaction(async conn => {
    const entries = [];
    for (const file of files) {
      validateUpload(file);
      const id = randomUUID();
      await conn.execute(
        'INSERT INTO uploaded_media (id, owner_id, scope, scope_id, filename, mime, size, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, ownerId, scope, scopeId, String(file.originalname || 'file').slice(0, 200), file.mimetype, file.buffer.length, file.buffer]
      );
      entries.push({ media_id: id, file_url: `/api/media/${id}`, file_name: file.originalname, file_type: file.mimetype, file_size: file.buffer.length });
    }
    return entries;
  });
}

async function findById(id) {
  return queryOne('SELECT id, owner_id, scope, scope_id, mime, size, filename, data FROM uploaded_media WHERE id = ?', [id]);
}

async function canRead(file, user = null) {
  const url = `/api/media/${file.id}`;
  if (file.scope === 'avatars' && await queryOne('SELECT id FROM users WHERE avatar = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0', [url])) return true;
  if (file.scope === 'reviews' && await queryOne('SELECT id FROM reviews WHERE is_visible = 1 AND images @> ?::jsonb', [JSON.stringify([url])])) return true;
  if (!user) return false;
  const admin = permission => user.role === 'admin' && (user.is_super_admin || (Array.isArray(user.permissions) && user.permissions.includes(permission)));
  if (file.scope === 'chat') {
    // A deleted message or removed participant must not keep attachment access.
    const message = await queryOne('SELECT m.conversation_id FROM message_files mf JOIN messages m ON m.id = mf.message_id WHERE mf.file_url = ? AND m.deleted_at IS NULL', [url]);
    return !!message && (admin('conversations.read') || await Conversation.isParticipant(message.conversation_id, user.id));
  }
  if (file.scope === 'requests') {
    return !!await queryOne(`SELECT r.id FROM request_files rf JOIN requests r ON r.id = rf.request_id
      WHERE rf.file_url = ? AND r.deleted_at IS NULL AND (r.client_id = ? OR r.assigned_provider_id = ? OR ? = 1)`,
    [url, user.id, user.id, admin('requests.manage') ? 1 : 0]);
  }
  if (file.scope === 'disputes') {
    return !!await queryOne(`SELECT d.id FROM dispute_evidence e JOIN disputes d ON d.id = e.dispute_id
      LEFT JOIN requests r ON r.id = d.request_id WHERE e.file_url = ?
      AND ((r.deleted_at IS NULL AND (r.client_id = ? OR r.assigned_provider_id = ?)) OR ? = 1)`,
    [url, user.id, user.id, admin('disputes.manage') ? 1 : 0]);
  }
  return Number(file.owner_id) === Number(user.id);
}

async function removeBatch(ids) {
  if (!ids.length) return;
  await query(`DELETE FROM uploaded_media WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}

module.exports = { createBatch, findById, canRead, removeBatch };
