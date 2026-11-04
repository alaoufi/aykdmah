'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function openAuth(dir, secret) {
  fs.mkdirSync(dir, {recursive:true, mode:0o700});
  const db = new DatabaseSync(path.join(dir, 'auth.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, since INTEGER NOT NULL, count INTEGER NOT NULL);
  `);
  const digest = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const clean = () => db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  const day = 86400000;
  return {
    db, digest,
    issue() {
      clean();
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token), Date.now()+day);
      return token;
    },
    verify(cookie='') {
      const token = /(?:^|;\s*)__Host-agent_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1];
      if (!token) return null;
      return db.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').get(digest(token),Date.now())?.id;
    },
    revoke(id) { db.prepare('DELETE FROM sessions WHERE id=?').run(id); },
    blocked(ip) {
      const row = db.prepare('SELECT count FROM attempts WHERE id=? AND since>?').get(digest(ip),Date.now()-900000);
      return (row?.count || 0) >= 8;
    },
    fail(ip) {
      db.prepare('DELETE FROM attempts WHERE since<=?').run(Date.now()-900000);
      db.prepare('INSERT INTO attempts VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET count=count+1').run(digest(ip),Date.now());
    },
    clear(ip) { db.prepare('DELETE FROM attempts WHERE id=?').run(digest(ip)); },
    close() { db.close(); }
  };
}
module.exports = {openAuth};
