const { randomUUID } = require('crypto');
const { hasPermission } = require('../middleware/roleCheck');
const { query, queryOne, transaction } = require('../config/database');
const { validateUpload } = require('../utils/uploadValidation');
const Conversation = require('./Conversation');
const storage = require('../services/objectStorage');

// AYK-248: with R2 configured the bytes go to the private media bucket (from memory, never the
// server's disk) and the row keeps only the metadata and access scope; otherwise they stay in the
// database as before. Objects uploaded for a batch that then fails are deleted again.
async function createBatch(files, { ownerId, scope, scopeId = null }) {
  const useR2 = storage.enabled();
  const prepared = files.map(file => {
    validateUpload(file);
    const id = randomUUID();
    return { file, id, key: useR2 ? storage.objectKey(scope, id) : null };
  });
  const uploaded = [];
  try {
    if (useR2) {
      for (const item of prepared) {
        await storage.put(item.key, item.file.buffer, item.file.mimetype);
        uploaded.push(item.key);
      }
    }
    return await transaction(async conn => {
      const entries = [];
      for (const { file, id, key } of prepared) {
        const name = String(file.originalname || 'file').slice(0, 200);
        if (key) {
          await conn.execute(
            "INSERT INTO uploaded_media (id, owner_id, scope, scope_id, filename, mime, size, data, storage, object_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'r2', ?, 'ready')",
            [id, ownerId, scope, scopeId, name, file.mimetype, file.buffer.length, key]
          );
        } else {
          await conn.execute(
            'INSERT INTO uploaded_media (id, owner_id, scope, scope_id, filename, mime, size, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, ownerId, scope, scopeId, name, file.mimetype, file.buffer.length, file.buffer]
          );
        }
        entries.push({ media_id: id, file_url: `/api/media/${id}`, file_name: file.originalname, file_type: file.mimetype, file_size: file.buffer.length });
      }
      return entries;
    });
  } catch (err) {
    for (const key of uploaded) await storage.remove(key).catch(() => {});
    throw err;
  }
}

async function findById(id) {
  return queryOne('SELECT id, owner_id, scope, scope_id, mime, size, filename, data, storage, object_key, status FROM uploaded_media WHERE id = ?', [id]);
}

async function canRead(file, user = null) {
  const url = `/api/media/${file.id}`;
  if (file.scope === 'avatars' && await queryOne('SELECT id FROM users WHERE avatar = ? AND deleted_at IS NULL AND is_active = 1 AND is_blocked = 0', [url])) return true;
  if (file.scope === 'reviews' && await queryOne('SELECT id FROM reviews WHERE is_visible = 1 AND images @> ?::jsonb', [JSON.stringify([url])])) return true;
  if (!user) return false;
  const admin = permission => hasPermission(user, permission);
  if (file.scope === 'chat') {
    // A deleted message or removed participant must not keep attachment access.
    // One attachment may be sent to several chats at once ("to everyone", AYK-043).
    const messages = await query('SELECT DISTINCT m.conversation_id FROM message_files mf JOIN messages m ON m.id = mf.message_id WHERE mf.file_url = ? AND m.deleted_at IS NULL', [url]);
    if (!messages.length) return false;
    if (admin('conversations.read')) return true;
    for (const message of messages) if (await Conversation.isParticipant(message.conversation_id, user.id)) return true;
    return false;
  }
  if (file.scope === 'requests') {
    return !!await queryOne(`SELECT r.id FROM request_files rf JOIN requests r ON r.id = rf.request_id
      WHERE rf.file_url = ? AND r.deleted_at IS NULL AND (r.client_id = ? OR r.assigned_provider_id = ? OR ? = 1
        -- A provider in contact about the request hears its voice note and sees its photos (AYK-043).
        OR EXISTS (SELECT 1 FROM offers o WHERE o.request_id = r.id AND o.provider_id = ?))`,
    [url, user.id, user.id, admin('requests.manage') ? 1 : 0, user.id]);
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
  const marks = ids.map(() => '?').join(',');
  const objects = await query(`SELECT object_key FROM uploaded_media WHERE id IN (${marks}) AND object_key IS NOT NULL`, ids);
  await query(`DELETE FROM uploaded_media WHERE id IN (${marks})`, ids);
  for (const { object_key: key } of objects) await storage.remove(key).catch(() => {});
}

module.exports = { createBatch, findById, canRead, removeBatch };
