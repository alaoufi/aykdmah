'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const manifest = 'snapshot-v1.json';

// Both snapshots are taken while holding writer reservations in a fixed order.
// Stop services first; an in-flight job cannot be safely restored to another host.
function snapshot(source, target, restore = false, webDir = path.join(source,'web')) {
  source = fs.realpathSync(source);
  webDir = fs.realpathSync(restore ? path.join(source,'web') : webDir);
  const files = [
    [path.join(source,'queue.sqlite'), 'queue.sqlite'],
    [path.join(webDir,'auth.sqlite'), path.join('web','auth.sqlite')],
  ];
  target = path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  if ([source,webDir].some(dir => target === dir || target.startsWith(dir + path.sep))) throw Error('Choose a separate private destination');
  for (let parent = path.dirname(target); ; parent = path.dirname(parent)) {
    if (fs.existsSync(path.join(parent, '.git'))) throw Error('Use a destination outside Git');
    if (parent === path.dirname(parent)) break;
  }
  for (const [sourceFile] of files) {
    if (!fs.lstatSync(sourceFile).isFile()) throw Error('Missing regular database file');
  }
  if (restore && JSON.parse(fs.readFileSync(path.join(source, manifest))).format !== 1) throw Error('Incomplete snapshot');
  fs.mkdirSync(target, { mode: 0o700 }); // Atomic, exclusive: never replace an existing backup or live installation.
  const locks = [];
  try {
    fs.mkdirSync(path.join(target,'web'), { mode: 0o700 });
    for (const [sourceFile] of files) {
      const lock = new DatabaseSync(sourceFile);
      locks.push(lock);
      lock.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE');
    }
    if (locks[0].prepare("SELECT 1 FROM tasks WHERE status='running' LIMIT 1").get()) throw Error('Resolve in-flight jobs first');
    for (const [sourceFile,file] of files) {
      const db = new DatabaseSync(sourceFile, { readOnly: true });
      const dest = path.join(target,file);
      try {
        fs.closeSync(fs.openSync(dest, 'wx', 0o600));
        db.prepare('VACUUM INTO ?').run(dest);
      } finally {
        db.close();
      }
      const copy = new DatabaseSync(dest);
      try {
        if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Invalid snapshot');
        if (restore && path.basename(file) === 'auth.sqlite') {
          // Never resurrect logged-out sessions or notifications to revoked devices.
          copy.exec('BEGIN; DELETE FROM sessions');
          for (const name of ['devices','notices']) {
            if (copy.prepare('SELECT 1 FROM sqlite_schema WHERE type=\'table\' AND name=?').get(name)) {
              copy.exec('DELETE FROM '+name);
            }
          }
          copy.exec('COMMIT');
        }
      } finally { copy.close(); }
    }
    if (!restore) fs.writeFileSync(path.join(target, manifest), JSON.stringify({ format: 1, date: new Date().toISOString() }), { flag:'wx', mode:0o600 });
  } catch (error) {
    // Remove only files this invocation placed in the exclusively-created directory.
    for (const file of [...files.map(([,file]) => file),manifest]) {
      try { fs.unlinkSync(path.join(target,file)); } catch (cleanError) { if (cleanError.code !== 'ENOENT') throw cleanError; }
    }
    fs.rmdirSync(path.join(target,'web'));
    fs.rmdirSync(target);
    throw error;
  } finally {
    for (const lock of locks.reverse()) lock.close();
  }
}

if (require.main === module) {
  const [command,source,target] = process.argv.slice(2);
  if (!['save','restore'].includes(command) || !source || !target) throw Error('backup.cjs save|restore SOURCE NEW_DESTINATION');
  process.umask(0o077);
  snapshot(source,target,command === 'restore',process.env.AGENT_AUTH_DIR);
  console.log('Private database copy verified');
}
module.exports = { snapshot };
