'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const LEASE_MS = 90_000;
const terminal = new Set(['needs-verification', 'needs-clarification', 'needs-approval', 'paused', 'paused-limit', 'blocked', 'failed']);
const clipped = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const iso = () => new Date().toISOString();
const requiresApproval = text => /\b(?:deploy|publish|release|pay|payment|dns|production)\b|نشر|رفع.{0,25}متجر|حذف.{0,25}بيانات|دفع.{0,15}مبلغ|تغيير.{0,20}نطاق/i.test(text);

function openQueue(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filename = path.join(dir, 'queue.sqlite');
  // Precreate with private permissions, including when used outside the service.
  fs.closeSync(fs.openSync(filename, 'a', 0o600));
  const db = new DatabaseSync(filename);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  try {
    db.exec(`
      PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, agent TEXT NOT NULL, provider TEXT NOT NULL,
        text TEXT NOT NULL, acceptance TEXT NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL,
        finishedAt TEXT, token TEXT, expires INTEGER, message TEXT NOT NULL DEFAULT '', checkpoint TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS tasks_waiting ON tasks(project,status,createdAt);
      CREATE INDEX IF NOT EXISTS tasks_created ON tasks(project,createdAt);
      CREATE TABLE IF NOT EXISTS chat (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, date TEXT NOT NULL, agent TEXT
      );
      CREATE INDEX IF NOT EXISTS project_chat ON chat(project,date);
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY, task TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY);
      CREATE INDEX IF NOT EXISTS task_events ON events(task,seq DESC);
      CREATE TABLE IF NOT EXISTS clarifications (task TEXT PRIMARY KEY, acceptance TEXT NOT NULL);
    `);
    transaction(() => {
      if (db.prepare("SELECT 1 FROM metadata WHERE key='legacy-import-v1'").get()) return;
      const oldChat = path.join(dir, 'messages.json');
      if (fs.existsSync(oldChat)) {
        for (const m of JSON.parse(fs.readFileSync(oldChat, 'utf8'))) {
          appendMessage(m.id, m.project, m.role, m.text, m.date, m.agent || null);
        }
      }
      const jobs = path.join(dir, 'jobs');
      const names = fs.existsSync(jobs) ? fs.readdirSync(jobs) : [];
      // A crash in the old worker could leave result AND running files. Terminal file wins.
      for (const kind of ['result', 'running', 'pending']) {
        for (const name of names.filter(n => n.endsWith('.' + kind + '.json'))) {
          const j = JSON.parse(fs.readFileSync(path.join(jobs, name), 'utf8'));
          if (name !== j.id + '.' + kind + '.json') throw Error('Legacy task identity mismatch');
          if (db.prepare('SELECT 1 FROM tasks WHERE id=?').get(j.id)) continue;
          const status = kind === 'pending' ? 'needs-clarification' : kind === 'running' ? 'interrupted' :
            terminal.has(j.status) ? j.status : 'needs-verification';
          // The legacy adapter could switch providers before persisting its progress.
          const provider = kind === 'running' ? '*' : (j.agentUsed || j.agent || 'codex');
          insertTask({ ...j, createdAt: j.createdAt || iso(), agent: j.agent || 'auto' }, provider, status);
          db.prepare('UPDATE tasks SET message=?, checkpoint=?, finishedAt=? WHERE id=?').run(
            clipped(j.message, 1000), clipped(j.lastOutput, 4000), j.finishedAt || null, j.id);
        }
      }
      db.exec("INSERT INTO metadata VALUES ('legacy-import-v1')");
    });
  } catch (error) {
    db.close();
    throw error;
  }

  function event(id, state) {
    db.prepare('INSERT INTO events(task,status,at) VALUES(?,?,?)').run(id, state, iso());
  }
  function appendMessage(id, project, role, text, date, agent) {
    db.prepare('INSERT INTO chat(id,project,role,text,date,agent) VALUES(?,?,?,?,?,?)')
      .run(id, project, role, text, date, agent);
  }
  function insertTask(j, provider, status) {
    db.prepare('INSERT INTO tasks(id,project,agent,provider,text,acceptance,status,createdAt) VALUES(?,?,?,?,?,?,?,?)')
      .run(j.id, j.project, j.agent, provider, j.text, j.acceptance || '', status, j.createdAt);
    event(j.id, status);
  }
  function enqueue(j) {
    return transaction(() => {
      const old = db.prepare('SELECT * FROM tasks WHERE id=?').get(j.id);
      if (old) {
        if (old.project !== j.project || old.agent !== j.agent || old.text !== j.text || old.acceptance !== (j.acceptance || '')) {
          throw Object.assign(Error('معرّف الطلب مستخدم بمحتوى آخر'), { code: 'ID_CONFLICT' });
        }
        return false;
      }
      const createdAt = iso();
      const cutoff = new Date(Date.now() - 3600000).toISOString();
      if (db.prepare('SELECT count(*) AS n FROM tasks WHERE project=? AND createdAt>?').get(j.project,cutoff).n >= 60) {
        throw Object.assign(Error('بلغ المشروع حد المهام الجديدة لهذه الساعة'), { code: 'TASK_LIMIT' });
      }
      const status = requiresApproval(j.text+'\n'+(j.acceptance || '')) ? 'needs-approval' :
        j.status || (j.acceptance ? 'pending' : 'needs-clarification');
      if (!['pending','needs-clarification','needs-approval'].includes(status)) throw Error('Invalid initial task state');
      if (status === 'pending' && !j.acceptance?.trim()) throw Error('Missing testable acceptance criteria');
      if (!['codex', 'claude', 'auto'].includes(j.agent)) throw Error('Unknown provider');
      insertTask({ ...j, createdAt }, j.agent === 'auto' ? 'codex' : j.agent, status);
      if (status === 'needs-clarification') event(j.id, 'awaiting-owner-criteria');
      appendMessage(j.id, j.project, 'user', j.text, createdAt, j.agent);
      return true;
    });
  }
  function clarify(project, id, acceptance) {
    if (typeof acceptance !== 'string' || !acceptance.trim() || acceptance.length > 8000) return false;
    return transaction(() => {
      const j = db.prepare(`
        SELECT text FROM tasks WHERE project=? AND id=? AND status='needs-clarification'
        AND (SELECT status FROM events WHERE task=? ORDER BY seq DESC LIMIT 1)='awaiting-owner-criteria'
      `).get(project,id,id);
      if (!j) return false;
      const status = requiresApproval(j.text+'\n'+acceptance) ? 'needs-approval' : 'pending';
      db.prepare('INSERT INTO clarifications VALUES (?,?)').run(id, acceptance);
      db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,id);
      appendMessage(randomUUID(), project, 'user', id+'\n'+acceptance, iso(), null);
      event(id, status);
      return true;
    });
  }
  function claim(project, now = Date.now()) {
    return transaction(() => {
      const stale = db.prepare("UPDATE tasks SET status='interrupted', token=NULL, expires=NULL, message=? WHERE status='running' AND expires<=? RETURNING id")
        .all('انقطع اتصال العامل. راجع أثر المهمة قبل تحرير الحجز.', now);
      for (const j of stale) event(j.id, 'interrupted');
      const j = db.prepare(`
        SELECT id,project,agent,provider,text,coalesce(
          (SELECT acceptance FROM clarifications WHERE task=candidate.id),acceptance
        ) AS acceptance FROM tasks AS candidate
        WHERE project=? AND status='pending' AND NOT EXISTS (
          SELECT 1 FROM tasks AS held WHERE held.status IN ('running','interrupted')
          AND (held.project=candidate.project OR held.provider=candidate.provider OR held.provider='*')
        )
        ORDER BY createdAt, rowid LIMIT 1
      `).get(project);
      if (!j) return null;
      const token = randomUUID();
      db.prepare("UPDATE tasks SET status='running', token=?, expires=? WHERE id=?").run(token, now + LEASE_MS, j.id);
      event(j.id, 'running');
      return { ...j, token };
    });
  }
  function renew(j, now = Date.now()) {
    return db.prepare("UPDATE tasks SET expires=? WHERE id=? AND token=? AND status='running' AND expires>?")
      .run(now + LEASE_MS, j.id, j.token, now).changes === 1;
  }
  function finish(j, result = {}) {
    // A successful CLI exit cannot prove a tested, reviewed and pushed change.
    const status = result.status === 'completed' ? 'needs-verification' :
      terminal.has(result.status) ? result.status : 'needs-verification';
    const message = clipped(result.message, 2000), output = clipped(result.output, 16000);
    return transaction(() => {
      const done = iso();
      const updated = db.prepare('UPDATE tasks SET status=?,message=?,checkpoint=?,finishedAt=?,token=NULL,expires=NULL WHERE id=? AND token=? AND status=\'running\' AND expires>?')
        .run(status, message, clipped(result.checkpoint, 4000), done, j.id, j.token, Date.now());
      if (!updated.changes) return false;
      event(j.id, status);
      if (['blocked','paused'].includes(status) && result.retrySafe === true) event(j.id, 'blocked-before-execution');
      appendMessage(randomUUID(), j.project, 'system', [j.id, status, message, output].filter(Boolean).join('\n'), done, j.provider);
      return true;
    });
  }
  function resume(id, project = null) {
    return transaction(() => {
      const changed = db.prepare(`UPDATE tasks SET status='pending',finishedAt=NULL,message=''
        WHERE id=? AND (? IS NULL OR project=?) AND status IN ('paused','blocked') AND (
          SELECT status FROM events WHERE task=? ORDER BY seq DESC LIMIT 1
        )='blocked-before-execution'`).run(id,project,project,id);
      if (changed.changes) event(id,'pending');
      return changed.changes === 1;
    });
  }
  function reconcile(id) {
    return transaction(() => {
      const changed = db.prepare("UPDATE tasks SET status='needs-verification',finishedAt=? WHERE id=? AND status='interrupted'").run(iso(), id);
      if (changed.changes) event(id, 'needs-verification');
      return changed.changes === 1;
    });
  }
  return {
    enqueue, clarify, claim, renew, finish, reconcile, resume,
    handoff: (project,id) => db.prepare(`SELECT id,project,text,coalesce(
      (SELECT acceptance FROM clarifications WHERE task=tasks.id),acceptance
    ) AS acceptance,status,message,checkpoint FROM tasks WHERE project=? AND id=?`).get(project,id) || null,
    messages: project => db.prepare(`SELECT id,project,role,text,date,agent FROM (
      SELECT *,rowid AS sequence FROM chat WHERE project=? ORDER BY date DESC,rowid DESC LIMIT 500
    ) ORDER BY date,sequence`).all(project),
    jobs: project => db.prepare(`SELECT id,project,agent,provider AS agentUsed,status,createdAt,finishedAt,message,checkpoint,
      status='needs-clarification' AND (SELECT status FROM events WHERE task=tasks.id ORDER BY seq DESC LIMIT 1)='awaiting-owner-criteria' AS canClarify,
      status IN ('paused','blocked') AND (SELECT status FROM events WHERE task=tasks.id ORDER BY seq DESC LIMIT 1)='blocked-before-execution' AS canResume
      FROM tasks WHERE project=? ORDER BY createdAt DESC,rowid DESC LIMIT 100`).all(project)
      .map(j => ({ ...j, canClarify:Boolean(j.canClarify), canResume:Boolean(j.canResume) })),
    close: () => db.close(),
  };
}

module.exports = { openQueue, LEASE_MS, requiresApproval };
