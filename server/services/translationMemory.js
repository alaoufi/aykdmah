// Translation memory and monthly usage (AYK-121).
// A sentence translated once is answered from our own database afterwards: instant, and
// it does not count against the translator's monthly quota. Only the very same sentence is
// reused, letter for letter (case included); nothing is guessed from a similar one. Only
// short messages are kept (the everyday phrases that repeat).
const crypto = require('crypto');
const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

const MAX_KEPT = 300;
// Microsoft's free tier (F0) translates 2 million characters a month.
const FREE_MONTHLY_CHARS = 2000000;

// Spaces around the sentence are the only thing ignored.
const normalize = text => String(text || '').trim();
const hashOf = text => crypto.createHash('sha256').update(normalize(text)).digest('hex');
const monthNow = () => new Date().toISOString().slice(0, 7);

async function recall(text, target) {
  if (String(text).length > MAX_KEPT) return null;
  try {
    const row = await queryOne('SELECT id, source_lang, translated_text, same_language FROM translation_memory WHERE source_hash = ? AND target_lang = ?', [hashOf(text), target]);
    if (!row) return null;
    query('UPDATE translation_memory SET hits = hits + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]).catch(() => {});
    count('memory', String(text).length).catch(() => {});
    return Number(row.same_language)
      ? { text, provider: 'noop', from: row.source_lang || null }
      : { text: row.translated_text, provider: 'memory', from: row.source_lang || null };
  } catch (err) {
    logger.warn('Translation memory read failed:', err.message);
    return null;
  }
}

async function remember(text, target, result) {
  if (String(text).length > MAX_KEPT || !result?.text) return;
  const same = result.provider === 'noop' ? 1 : 0;
  try {
    await query(`INSERT INTO translation_memory (source_hash, target_lang, source_lang, translated_text, same_language)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (source_hash, target_lang) DO NOTHING`,
    [hashOf(text), target, result.from || null, same ? '' : result.text, same]);
  } catch (err) {
    logger.warn('Translation memory write failed:', err.message);
  }
}

async function count(provider, chars) {
  await query(`INSERT INTO translation_usage (month, provider, chars, requests) VALUES (?, ?, ?, 1)
    ON CONFLICT (month, provider) DO UPDATE SET chars = translation_usage.chars + EXCLUDED.chars,
      requests = translation_usage.requests + 1`, [monthNow(), provider, chars]);
}

// Characters sent to Microsoft; at 80% of the free month every admin is told, once.
async function countPaid(chars) {
  try {
    await count('microsoft', chars);
    const row = await queryOne(`UPDATE translation_usage SET alerted = 1
      WHERE month = ? AND provider = 'microsoft' AND alerted = 0 AND chars >= ? RETURNING chars`, [monthNow(), Math.floor(FREE_MONTHLY_CHARS * 0.8)]);
    if (row) await tellAdmins('translation_quota_80', Math.round(Number(row.chars) / FREE_MONTHLY_CHARS * 100));
  } catch (err) {
    logger.warn('Translation usage count failed:', err.message);
  }
}

// The free month ran out (Microsoft refused): admins are told once that month.
async function quotaExhausted() {
  try {
    await count('microsoft', 0);
    const row = await queryOne(`UPDATE translation_usage SET alerted = 2
      WHERE month = ? AND provider = 'microsoft' AND alerted < 2 RETURNING id`, [monthNow()]);
    if (row) await tellAdmins('translation_quota_out', 100);
  } catch (err) {
    logger.warn('Translation quota notice failed:', err.message);
  }
}

async function tellAdmins(key, percent) {
  const notificationService = require('./notificationService');
  const { translate } = require('../utils/i18n');
  const admins = await query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND deleted_at IS NULL");
  await notificationService.broadcast(admins.map(row => row.id), {
    type: 'system', title: translate('ar', 'translation_quota_title'), body: translate('ar', key, { percent }), link: '/admin',
  });
}

// For the admin dashboard: this month's characters by source, and the size of the memory.
async function summary() {
  const rows = await query('SELECT provider, chars, requests FROM translation_usage WHERE month = ?', [monthNow()]);
  const by = Object.fromEntries(rows.map(row => [row.provider, row]));
  const kept = await queryOne('SELECT COUNT(*) AS total FROM translation_memory');
  return {
    month: monthNow(),
    limit: FREE_MONTHLY_CHARS,
    used: Number(by.microsoft?.chars || 0),
    from_memory: Number(by.memory?.chars || 0),
    memory_hits: Number(by.memory?.requests || 0),
    remembered: Number(kept?.total || 0),
  };
}

module.exports = { recall, remember, countPaid, quotaExhausted, summary, hashOf, FREE_MONTHLY_CHARS };
