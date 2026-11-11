#!/usr/bin/env node
// Gives an existing account full admin rights, at the owner's request (AYK-203): one account for the
// site, the app and the admin area. Dry run by default; --apply changes it. It never creates an
// account or touches a password. Find the account by its phone (any format) or its id.
// Usage: docker exec aykdmh-app node server/scripts/grant-admin.js --phone 05XXXXXXXX [--apply]
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const phone = String(value('--phone') || '').replace(/\D/g, '');
  const id = Number(value('--id'));
  if (!(phone.length >= 9) && !Number.isSafeInteger(id)) throw new Error('Usage: --phone 05XXXXXXXX or --id N, then --apply');
  const db = require('../config/database');
  try {
    // The last nine digits match 05…, 9665… and +9665… alike.
    const rows = Number.isSafeInteger(id) && id > 0
      ? await db.query('SELECT id, role, is_super_admin FROM users WHERE id = ? AND deleted_at IS NULL', [id])
      : await db.query("SELECT id, role, is_super_admin FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = ? AND deleted_at IS NULL", [phone.slice(-9)]);
    if (rows.length !== 1) throw new Error(rows.length ? `${rows.length} accounts match; use --id.` : 'No account matches.');
    const user = rows[0];
    console.log(`Account ${user.id}: role ${user.role}, super admin ${Number(user.is_super_admin) ? 'yes' : 'no'}.`);
    if (!args.includes('--apply')) { console.log('Dry run: add --apply to give it full admin rights.'); return; }
    await db.query("UPDATE users SET role = 'admin', is_super_admin = 1, is_active = 1, is_blocked = 0 WHERE id = ?", [user.id]);
    await db.query("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?, 'grant_admin', 'user', ?, ?)",
      [user.id, user.id, JSON.stringify({ from_role: user.role, by: 'server script AYK-203' })]).catch(() => {});
    console.log(`Done: account ${user.id} now has full admin rights (was ${user.role}).`);
  } finally {
    await db.getPool().end().catch(() => {});
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
