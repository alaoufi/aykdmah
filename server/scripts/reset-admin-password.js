#!/usr/bin/env node
// Sets a new password for an administrator (AYK-152), typed on the server so it never travels in a
// message or a file. Signs out that account's existing sessions.
// Usage on the server: docker exec -it aykdmh-app node server/scripts/reset-admin-password.js aykdmh_admin
const readline = require('node:readline');

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = text => { if (!rl.stdoutMuted) rl.output.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    rl.stdoutMuted = true;
  });
}

async function main() {
  const identifier = String(process.argv[2] || '').trim();
  if (!identifier) throw new Error('Usage: node server/scripts/reset-admin-password.js <admin username, email or phone>');
  const db = require('../config/database');
  const User = require('../models/User');
  const { hashPassword } = require('../utils/hash');
  try {
    const admin = await db.queryOne(
      "SELECT id, username FROM users WHERE (username = ? OR email = ? OR phone = ?) AND role = 'admin' AND deleted_at IS NULL",
      [identifier, identifier, identifier],
    );
    if (!admin) throw new Error(`No administrator "${identifier}".`);
    const password = await askHidden('كلمة المرور الجديدة (4 خانات على الأقل): ');
    if (Array.from(password).length < 4) throw new Error('كلمة المرور 4 خانات على الأقل.');
    if (await askHidden('أعد كتابتها: ') !== password) throw new Error('الكلمتان غير متطابقتين.');
    await User.updatePassword(admin.id, await hashPassword(password));
    console.log(`تم: كلمة مرور ${admin.username || identifier} الجديدة محفوظة. ادخل من /admin/login`);
  } finally {
    await db.getPool().end().catch(() => {});
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
