const path = require('path');
const UploadedMedia = require('../models/UploadedMedia');
const { publicUrlFor, deleteFile } = require('./fileHelper');

// Persist only after controller authorization/validation. Compensate if the
// domain write fails; model transactions roll back its attachment rows.
async function withUploadedFiles(files = [], options, write) {
  let entries = [];
  try {
    const buffered = files.filter(file => Buffer.isBuffer(file.buffer));
    const stored = buffered.length ? await UploadedMedia.createBatch(buffered, options) : [];
    let storedIndex = 0;
    entries = files.map(file => Buffer.isBuffer(file.buffer) ? stored[storedIndex++] : {
      file_url: publicUrlFor(`uploads/${options.scope}/${path.basename(file.path)}`),
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
    });
    return await write(entries);
  } catch (err) {
    await UploadedMedia.removeBatch(entries.filter(entry => entry.media_id).map(entry => entry.media_id));
    for (const file of files) if (file.path) deleteFile(file.path);
    throw err;
  } finally {
    for (const file of files) delete file.buffer;
  }
}

module.exports = { withUploadedFiles };
