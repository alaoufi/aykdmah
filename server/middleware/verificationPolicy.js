const { query } = require('../config/database');
const { ApiError } = require('./errorHandler');
const { unauthorized } = require('../utils/apiResponse');

const POLICY_KEYS = ['verify_block_until_verified', 'verify_required_for_provider', 'verify_required_for_client', 'verify_allow_guest_browsing'];
const METHODS = new Set(['sms', 'whatsapp', 'email', 'nafath']);
const phone = value => String(value || '').trim().replace(/[\s()-]/g, '');
const email = value => String(value || '').trim().toLowerCase();

async function marketplacePolicy(runQuery = query) {
  // Read the registry atomically. A DB error must propagate, rather than
  // defaulting a configured restriction off while the platform keeps writing.
  const rows = await runQuery(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${POLICY_KEYS.map(() => '?').join(', ')})`, POLICY_KEYS);
  const values = Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
  const csv = value => [...new Set(String(value || '').split(',').map(key => key.trim().toLowerCase()).filter(Boolean))];
  return {
    block_until_verified: String(values.verify_block_until_verified) === 'true',
    allow_guest_browsing: String(values.verify_allow_guest_browsing ?? 'true') !== 'false',
    required_for_provider: csv(values.verify_required_for_provider),
    required_for_client: csv(values.verify_required_for_client),
  };
}

function currentVerification(row, user, now = Date.now()) {
  if (!row || row.status !== 'verified' || !row.verified_at || !Number.isFinite(new Date(row.verified_at).getTime())) return false;
  // A legacy approved Nafath row may retain its pending transaction timeout;
  // approval is permanent and remains bound to the recorded provider proof.
  if (row.method !== 'nafath' && row.expires_at && (!Number.isFinite(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() <= now)) return false;
  if (row.method === 'sms' || row.method === 'whatsapp') return !!phone(user.phone) && phone(row.identifier) === phone(user.phone);
  if (row.method === 'email') return !!email(user.email) && email(row.identifier) === email(user.email);
  if (row.method === 'nafath') {
    let metadata = row.metadata;
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch (_) { return false; } }
    return /^[12]\d{9}$/.test(String(row.identifier || '')) && metadata?.confirmed_via === 'nafath'
      && typeof metadata.transactionId === 'string' && metadata.transactionId.length > 0
      && Number.isSafeInteger(Number(metadata.integrationId)) && Number(metadata.integrationId) > 0
      && typeof metadata.provider === 'string' && metadata.provider.length > 0
      && !/(?:mock|stub|noop|sandbox|demo)/i.test(metadata.provider);
  }
  return false;
}

async function assertMarketplaceWriteAccess(subject, { query: runQuery = query } = {}) {
  const id = subject && typeof subject === 'object' ? subject.id : subject;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ApiError('must_login', 401);
  const users = await runQuery('SELECT id, email, phone, role, is_active, is_blocked FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  const user = users[0];
  if (!user || !user.is_active || user.is_blocked) throw new ApiError('forbidden', 403);
  if (user.role === 'admin') return;
  const policy = await marketplacePolicy(runQuery);
  const required = user.role === 'provider' ? policy.required_for_provider : policy.required_for_client;
  // Empty requirements are intentionally unrestricted, even when blocking is
  // enabled for the other role. This preserves the admin test-mode toggle.
  if (!policy.block_until_verified || !required.length) return;
  if (required.some(method => !METHODS.has(method))) throw new ApiError('verification_required', 403);
  const records = await runQuery('SELECT method, status, identifier, verified_at, expires_at, metadata FROM user_verifications WHERE user_id = ?', [user.id]);
  const byMethod = new Map(records.map(record => [record.method, record]));
  if (!required.every(method => currentVerification(byMethod.get(method), user))) throw new ApiError('verification_required', 403);
}

async function requireMarketplaceWrite(req, res, next) {
  try { await assertMarketplaceWriteAccess(req.user?.id); next(); }
  catch (err) { localizePolicyError(req, err); next(err); }
}

function localizePolicyError(req, err) {
  if (err.message !== 'verification_required') return;
  const message = req.t?.('verification_required');
  err.message = message && message !== 'verification_required' ? message : 'Complete the required account verification to continue.';
}

async function requireMarketplaceBrowse(req, res, next) {
  try {
    const policy = await marketplacePolicy();
    if (!policy.allow_guest_browsing && !req.user) return unauthorized(res, req.t('must_login'));
    next();
  } catch (err) { localizePolicyError(req, err); next(err); }
}

async function requireSelectedProviderVerification(req, res, next) {
  try {
    const rows = await query('SELECT o.provider_id, r.client_id FROM offers o JOIN requests r ON r.id = o.request_id WHERE o.id = ?', [req.params.id]);
    const offer = rows[0];
    if (offer && Number(offer.client_id) === Number(req.user.id)) await assertMarketplaceWriteAccess(offer.provider_id);
    next();
  } catch (err) { localizePolicyError(req, err); next(err); }
}

module.exports = { marketplacePolicy, currentVerification, assertMarketplaceWriteAccess, requireMarketplaceWrite, requireMarketplaceBrowse, requireSelectedProviderVerification };
