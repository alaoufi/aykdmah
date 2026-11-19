function invalidMessage() {
  return Object.assign(new Error('Invalid message'), { status: 400 });
}

function validateChatMessage({ content, message_type = 'text', files = [] }) {
  if (!['text', 'image', 'file', 'voice', 'location'].includes(message_type)
      || (content != null && (typeof content !== 'string' || content.length > 10000 || content.includes('\0')))
      || !Array.isArray(files) || files.length > 4) throw invalidMessage();
  const mime = file => String(file.file_type || file.mimetype || '');
  if ((message_type === 'voice' && (files.length !== 1 || !mime(files[0]).startsWith('audio/')))
      || (message_type === 'image' && (!files.length || files.some(file => !mime(file).startsWith('image/'))))
      || (message_type === 'file' && !files.length)
      || (message_type === 'location' && files.length)
      || (message_type !== 'location' && !files.length && !content?.trim())) throw invalidMessage();
  for (const file of files) {
    if (file.duration_seconds != null && (!Number.isSafeInteger(file.duration_seconds)
        || file.duration_seconds < 1 || file.duration_seconds > 600
        || !/^(?:audio|video)\//.test(mime(file)))) throw invalidMessage();
  }
}

// Optional recording metadata is a bounded client estimate, not measured media
// duration and not an authorization or size-limit input.
function recordingDuration(value, files) {
  if (value == null || value === '') return null;
  if ((typeof value !== 'string' && typeof value !== 'number')
      || !/^\d{1,3}$/.test(String(value)) || files.length !== 1
      || !/^(?:audio|video)\//.test(String(files[0].mimetype || files[0].file_type || ''))) throw invalidMessage();
  const duration = Number(value);
  if (duration < 1 || duration > 600) throw invalidMessage();
  return duration;
}

function searchQuery(value = '') {
  if (typeof value !== 'string' || value.length > 200) throw Object.assign(new Error('Invalid search'), { status: 400 });
  return value.trim();
}
function forwardSelection(body = {}) {
  const ids = (values, max) => {
    if (!Array.isArray(values) || !values.length || values.length > max || values.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) throw Object.assign(new Error('Invalid forward selection'), { status: 400 });
    return [...new Set(values)];
  };
  return { messageIds: ids(body.message_ids, 20), targetIds: ids(body.conversation_ids, 20) };
}
function forwardOperationId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw Object.assign(new Error('Invalid forward operation'),{status:400});
  return value.toLowerCase();
}
function canForward(message, senderId) {
  return Boolean(message && !message.deleted_at && Number(message.sender_id) === Number(senderId)
    && ['text', 'voice', 'image', 'file'].includes(message.message_type));
}
module.exports = { validateChatMessage, recordingDuration, searchQuery, forwardSelection, forwardOperationId, canForward };
