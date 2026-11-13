const { setupFromEnv } = require('../services/installService');
const { query, getPool } = require('../config/database');
const { hashPassword } = require('../utils/hash');

async function main() {
  const result = await setupFromEnv();
  const errors = result.migrations.flatMap(m => m.errors);
  if (errors.length) throw new Error(`Migrations failed (${errors.length} statements). Fix them before using the application.`);
  if (result.admins === 0) {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12) {
      throw new Error('Tables are ready. Configure BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) in the trusted CLI environment to create the first administrator.');
    }
    const hash = await hashPassword(password);
    const admin = await query(`INSERT INTO users (full_name, email, password_hash, role, is_active, is_verified, is_super_admin, must_change_password)
      VALUES (?, ?, ?, 'admin', 1, 1, 1, 1)`, [process.env.BOOTSTRAP_ADMIN_NAME || 'مدير أي خدمة', email, hash]);
    await query(`INSERT INTO install_lock (is_installed, installed_at, installed_version, installed_by_email, site_name)
      VALUES (1, CURRENT_TIMESTAMP, '1.0.0', ?, 'أي خدمة')`, [email]);
    console.log(`Created administrator #${admin.insertId}; installation is locked.`);
  } else console.log('Database initialized. Existing administrator credentials were preserved.');
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => getPool().end());
