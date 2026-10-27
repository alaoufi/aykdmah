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

module.exports = { validateChatMessage, recordingDuration };
