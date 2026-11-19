#!/usr/bin/env node
// AYK-248 phase C: moves attachments still kept in the database (storage 'db') to the private R2
// media bucket, so the server keeps no user media at all. Each file is uploaded, its size checked
// in R2, and only then its row switches to R2 and its bytes are removed from the database (the
// database file shrinks after the next VACUUM).
// Removing the bytes is a deletion: run with --apply only with the owner's approval.
//   docker exec aykdmh-app node server/scripts/media-to-r2.js            # report only, changes nothing
//   docker exec aykdmh-app node server/scripts/media-to-r2.js --apply    # move everything
// Safe to stop and run again: moved rows are skipped; a file whose upload fails stays in the database.

async function moveMediaToR2({ apply = false, batch = 25, log = console.log } = {}) {
  const db = require('../config/database');
  const storage = require('../services/objectStorage');
  if (!storage.enabled()) throw new Error('R2_MEDIA_* are not set: nothing can be moved');
  const total = await db.queryOne("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM uploaded_media WHERE storage = 'db'");
  log(`in the database: ${total.n} files, ${(Number(total.bytes) / 1048576).toFixed(1)} MB`);
  if (!apply) { log('report only (add --apply to move them)'); return { found: Number(total.n), moved: 0, failed: 0 }; }
  let moved = 0, failed = 0, after = '';
  for (;;) {
    const rows = await db.query(`SELECT id, scope, mime, size, created_at FROM uploaded_media
      WHERE storage = 'db' AND id::text > ? ORDER BY id LIMIT ${Number(batch)}`, [after]);
    if (!rows.length) break;
    for (const row of rows) {
      after = String(row.id);
      const key = storage.objectKey(row.scope, row.id, new Date(row.created_at));
      try {
        const { data } = await db.queryOne('SELECT data FROM uploaded_media WHERE id = ?', [row.id]);
        await storage.put(key, data, row.mime);
        const stored = await storage.head(key);
        if (!stored || stored.size !== Number(row.size)) throw new Error('size differs in R2');
        await db.query("UPDATE uploaded_media SET storage = 'r2', object_key = ?, data = NULL WHERE id = ? AND storage = 'db'", [key, row.id]);
        moved += 1;
      } catch (err) {
        failed += 1;
        log(`kept in the database: ${row.id} (${err.message})`);
      }
    }
    log(`moved ${moved}${failed ? `, kept ${failed}` : ''}`);
  }
  const left = await db.queryOne("SELECT COUNT(*) AS n FROM uploaded_media WHERE storage = 'db'");
  log(`done: ${moved} moved to R2, ${Number(left.n)} still in the database`);
  return { found: Number(total.n), moved, failed };
}

if (require.main === module) {
  moveMediaToR2({ apply: process.argv.includes('--apply') })
    .then(result => { process.exitCode = result.failed ? 1 : 0; })
    .catch(err => { console.error(err.message); process.exitCode = 1; })
    .finally(() => require('../config/database').getPool().end().catch(() => {}));
}

module.exports = { moveMediaToR2 };
