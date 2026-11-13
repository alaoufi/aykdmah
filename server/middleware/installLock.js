const fs = require('fs');
const env = require('../config/env');
const { queryOne } = require('../config/database');

async function isInstalled() {
  if (fs.existsSync(env.PATHS.INSTALL_LOCK_FILE)) return true;
  try {
    const row = await queryOne('SELECT is_installed FROM install_lock WHERE is_installed = 1 LIMIT 1');
    return !!row;
  } catch (_) {
    return false;
  }
}

async function requireNotInstalled(req, res, next) {
  if (await isInstalled()) {
    return res.status(403).json({
      success: false,
      message: 'تم تثبيت النظام مسبقاً. يرجى حذف القفل يدوياً إذا كنت تريد إعادة التثبيت.',
    });
  }
  next();
}

async function requireInstalled(req, res, next) {
  if (!(await isInstalled())) {
    return res.status(503).json({
      success: false,
      message: 'النظام غير جاهز بعد. يرجى التواصل مع الإدارة.',
    });
  }
  next();
}

module.exports = { isInstalled, requireNotInstalled, requireInstalled };
