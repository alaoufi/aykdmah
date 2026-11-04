'use strict';
const webpush = require('web-push');

function validSubscription(subscription) {
  try {
    const u = new URL(subscription.endpoint);
    // Only browser push-service HTTPS endpoints can receive an outbound request.
    const allowed = u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' ||
      u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.notify.windows.com');
    return allowed && subscription.endpoint === u.href && !u.hash && u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      u.pathname.length > 1 && subscription.endpoint.length < 2048 &&
      /^[\w-]{87}=?$/.test(subscription.keys.p256dh) && /^[\w-]{22}={0,2}$/.test(subscription.keys.auth);
  } catch { return false; }
}

function openNotifications(auth, queue, projects, origin) {
  const db = auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS vapid (id INTEGER PRIMARY KEY, keys TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, session TEXT NOT NULL, since TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notices (endpoint TEXT NOT NULL, job TEXT NOT NULL, PRIMARY KEY(endpoint,job));`);
  const keys = db.prepare('SELECT keys FROM vapid WHERE id=1').get();
  const vapid = keys ? JSON.parse(keys.keys) : webpush.generateVAPIDKeys();
  if (!keys) db.prepare('INSERT INTO vapid VALUES (1,?)').run(JSON.stringify(vapid));
  function forget(endpoint) {
    db.prepare('DELETE FROM devices WHERE endpoint=?').run(endpoint);
    db.prepare('DELETE FROM notices WHERE endpoint=?').run(endpoint);
  }
  let sending = false;
  async function deliver() {
    if (sending) return;
    sending = true;
    try {
      const devices = db.prepare('SELECT * FROM devices').all();
      if (!devices.length) return;
      const tasks = projects.flatMap(p => queue.jobs(p.id)).filter(task =>
        ['completed','needs-verification','needs-clarification','failed','paused-limit','needs-review','blocked','interrupted'].includes(task.status) && task.finishedAt);
      for (const d of devices) {
        for (const t of tasks.filter(t => t.finishedAt >= d.since)) {
          if (db.prepare('SELECT 1 FROM notices WHERE endpoint=? AND job=?').get(d.endpoint,t.id)) continue;
          try {
            await webpush.sendNotification(JSON.parse(d.sub), JSON.stringify({tag:t.id}), {
              TTL:3600, timeout:7000, vapidDetails:{subject:origin, ...vapid}
            });
            db.prepare('INSERT OR IGNORE INTO notices VALUES (?,?)').run(d.endpoint,t.id);
          } catch (e) {
            if ([404,410].includes(e.statusCode)) forget(d.endpoint);
            break;
          }
        }
      }
    } finally { sending = false; }
  }
  const timer=setInterval(() => deliver().catch(() => console.error('Push delivery unavailable')),30000);
  timer.unref();
  return {
    publicKey:vapid.publicKey,
    subscribe(sub,session) {
      if (!validSubscription(sub)) return false;
      if (db.prepare('SELECT count(*) AS n FROM devices').get().n >= 20 &&
          !db.prepare('SELECT 1 FROM devices WHERE endpoint=?').get(sub.endpoint)) return false;
      const clean = {endpoint:sub.endpoint,keys:{auth:sub.keys.auth,p256dh:sub.keys.p256dh}};
      db.prepare('INSERT INTO devices VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET session=excluded.session, sub=excluded.sub')
        .run(clean.endpoint,JSON.stringify(clean),session,new Date().toISOString());
      return true;
    },
    logout(session) { for (const d of db.prepare('SELECT endpoint FROM devices WHERE session=?').all(session)) forget(d.endpoint); }
  };
}
module.exports={openNotifications, validSubscription};
