// High-level verification orchestrator.
//
// • Reads policy from settings (which methods enabled, OTP length, …)
// • Issues OTPs and delegates delivery to the active adapter
// • Persists status & audit
// • Returns plain JSON the controllers can ship to clients

const crypto = require('crypto');
const Setting = require('../models/Setting');
const ApiIntegration = require('../models/ApiIntegration');
const UserVerification = require('../models/UserVerification');
const integrations = require('./integrations');

const ENABLED_DEFAULT = 'sms,email';

async function getPolicy() {
  const [enabled, otpLen, otpTtl, otpResend, otpMax, emailTtl,
         reqProvider, reqClient, block, guestBrowse] = await Promise.all([
    Setting.get('verify_methods_enabled').catch(() => null),
    Setting.get('verify_otp_length').catch(() => null),
    Setting.get('verify_otp_ttl_minutes').catch(() => null),
    Setting.get('verify_otp_resend_seconds').catch(() => null),
    Setting.get('verify_otp_max_attempts').catch(() => null),
    Setting.get('verify_email_link_ttl_hours').catch(() => null),
    Setting.get('verify_required_for_provider').catch(() => null),
    Setting.get('verify_required_for_client').catch(() => null),
    Setting.get('verify_block_until_verified').catch(() => null),
    Setting.get('verify_allow_guest_browsing').catch(() => null),
  ]);
  const csv = (v, fb) => String(v ?? fb).split(',').map(s => s.trim()).filter(Boolean);
  const bounded = (value, fallback, min, max) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
  return {
    enabled: csv(enabled, ENABLED_DEFAULT),
    otp_length: bounded(otpLen, 6, 6, 10),
    otp_ttl_minutes: bounded(otpTtl, 10, 1, 30),
    otp_resend_seconds: bounded(otpResend, 60, 30, 3600),
    otp_max_attempts: bounded(otpMax, 5, 1, 10),
    email_link_ttl_hours: Number(emailTtl) || 24,
    required_for_provider: csv(reqProvider, ''),
    required_for_client: csv(reqClient, ''),
    block_until_verified: String(block) === 'true',
    allow_guest_browsing: String(guestBrowse ?? 'true') !== 'false',
  };
}

function generateOtp(length = 6) {
  if (!Number.isInteger(length) || length < 6 || length > 10) throw new Error('Invalid OTP length');
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

async function canResend(userId, method, throttleSec) {
  const last = await UserVerification.lastSentAt(userId, method);
  if (!last) return { ok: true };
  const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
  if (elapsed < throttleSec) {
    return { ok: false, retryAfter: Math.ceil(throttleSec - elapsed) };
  }
  return { ok: true };
}

// ---- OTP-based methods (sms / whatsapp / email) ----
async function startOtp({ user, method, identifier, ip = null, locale = 'ar' }) {
  const policy = await getPolicy();
  if (!policy.enabled.includes(method)) {
    return { ok: false, error: 'method_disabled' };
  }
  const storedIdentifier = String(method === 'email' ? user.email || '' : user.phone || '').trim();
  if (!storedIdentifier || String(identifier).trim().toLowerCase() !== storedIdentifier.toLowerCase()) return { ok: false, error: 'invalid_identifier' };
  identifier = storedIdentifier;
  const { adapter, integration } = await integrations.resolveActive(method);
  if (!adapter?.send) return { ok: false, error: 'not_configured' };
  const throttle = await canResend(user.id, method, policy.otp_resend_seconds);
  if (!throttle.ok) return { ok: false, error: 'throttled', retry_after: throttle.retryAfter };

  const code = generateOtp(policy.otp_length);
  let otpId;
  try { otpId = await UserVerification.createOtp({
    user_id: user.id, method, identifier, code,
    ttlMinutes: policy.otp_ttl_minutes, maxAttempts: policy.otp_max_attempts, throttleSeconds: policy.otp_resend_seconds, ip,
  }); } catch (err) {
    if (err.message === 'throttled') return { ok: false, error: 'throttled' };
    throw err;
  }

  const message = method === 'email'
    ? `${code}` // long-form HTML built below
    : `AY KHIDMA: ${code} — صالح ${policy.otp_ttl_minutes} دقائق / valid ${policy.otp_ttl_minutes} min`;
  const subject = 'AY KHIDMA — Verification code';
  const html = `
    <div style="font-family:Cairo,system-ui,sans-serif;direction:${locale==='ar'?'rtl':'ltr'};max-width:480px;margin:auto;padding:24px">
      <h2 style="margin:0 0 12px">AY KHIDMA</h2>
      <p>${locale==='ar' ? 'رمز التحقق الخاص بك:' : 'Your verification code:'}</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f3e7d2;padding:16px;border-radius:12px;text-align:center;color:#876239">${code}</div>
      <p style="color:#64748b;font-size:13px;margin-top:16px">
        ${locale==='ar'
          ? `صالح لمدة ${policy.otp_ttl_minutes} دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.`
          : `Valid for ${policy.otp_ttl_minutes} minutes. If you did not request this code, please ignore this email.`}
      </p>
    </div>`;

  const started = Date.now();
  try {
    if (method === 'email') {
      await adapter.send({
        credentials: integration?.credentials || {},
        config:      integration?.config || {},
        to: identifier, subject, html, text: `${subject}: ${code}`,
      });
    } else {
      await adapter.send({
        credentials: integration?.credentials || {},
        config:      integration?.config || {},
        to: identifier, message,
      });
    }
    await ApiIntegration.logUsage({
      integration_id: integration?.id || null, type: method, provider: adapter.name || integration?.provider,
      user_id: user.id, action: 'send_otp', status: 'ok',
      latency_ms: Date.now() - started, request_meta: { identifier_masked: maskId(identifier) },
    });
    await UserVerification.audit({
      user_id: user.id, method, action: 'send', result: 'ok',
      details: `to=${maskId(identifier)} via=${adapter.name || integration?.provider || 'noop'}`, ip,
    });
    return { ok: true, expires_in: policy.otp_ttl_minutes * 60 };
  } catch (err) {
    await UserVerification.consumeOtp(otpId);
    await ApiIntegration.logUsage({
      integration_id: integration?.id || null, type: method, provider: adapter?.name || integration?.provider,
      user_id: user.id, action: 'send_otp', status: 'error',
      error_message: 'delivery_failed', latency_ms: Date.now() - started,
    });
    await UserVerification.audit({
      user_id: user.id, method, action: 'send', result: 'error', details: 'delivery_failed', ip,
    });
    return { ok: false, error: 'send_failed' };
  }
}

async function confirmOtp({ user, method, code, ip = null }) {
  const policy = await getPolicy();
  if (!policy.enabled.includes(method)) return { ok: false, reason: 'method_disabled' };
  if (!/^\d{6,10}$/.test(code)) return { ok: false, reason: 'invalid_code' };
  const result = await UserVerification.verifyOtp(user.id, method, code, { verifyAccount: true });
  await UserVerification.audit({
    user_id: user.id, method, action: 'confirm',
    result: result.ok ? 'ok' : result.reason, ip,
  });
  if (!result.ok) return result;
  return { ok: true };
}

// ---- Nafath ----
async function startNafath({ user, nationalId, ip = null }) {
  const policy = await getPolicy();
  if (!policy.enabled.includes('nafath')) return { ok: false, error: 'method_disabled' };
  const { adapter, integration } = await integrations.resolveActive('nafath');
  if (!adapter?.start || !adapter?.status) return { ok: false, error: 'not_configured' };
  if (!/^[12]\d{9}$/.test(nationalId)) return { ok: false, error: 'invalid_identifier' };
  const started = Date.now();
  try {
    const res = await adapter.start({
      credentials: integration?.credentials || {},
      config:      integration?.config || {},
      nationalId,
    });
    await UserVerification.upsert({
      user_id: user.id, method: 'nafath', status: 'pending',
      identifier: nationalId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      metadata: { transactionId: res.transactionId, integrationId: integration?.id || null, provider: integration?.provider || adapter.name },
    });
    await ApiIntegration.logUsage({
      integration_id: integration?.id || null, type: 'nafath', provider: adapter.name || integration?.provider,
      user_id: user.id, action: 'nafath_start', status: 'ok', latency_ms: Date.now() - started,
    });
    await UserVerification.audit({
      user_id: user.id, method: 'nafath', action: 'start', result: 'ok',
      details: 'transaction_started', ip,
    });
    return { ok: true, transactionId: res.transactionId, code: res.code };
  } catch (err) {
    await UserVerification.audit({ user_id: user.id, method: 'nafath', action: 'start', result: 'error', details: 'start_failed', ip });
    return { ok: false, error: 'start_failed' };
  }
}

async function pollNafath({ user, transactionId, ip = null }) {
  const policy = await getPolicy();
  if (!policy.enabled.includes('nafath')) return { ok: false, error: 'method_disabled' };
  const { adapter, integration } = await integrations.resolveActive('nafath');
  if (!adapter?.status || !integration) return { ok: false, error: 'not_configured' };
  const current = await UserVerification.findCurrent(user.id, 'nafath');
  const metadata = typeof current?.metadata === 'string' ? JSON.parse(current.metadata) : current?.metadata;
  if (!current || current.status !== 'pending' || !current.expires_at || new Date(current.expires_at).getTime() <= Date.now()
      || metadata?.transactionId !== transactionId || metadata?.integrationId !== integration.id || metadata?.provider !== integration.provider) {
    return { ok: false, error: 'invalid_transaction' };
  }
  try {
    const res = await adapter.status({
      credentials: integration?.credentials || {},
      config:      integration?.config || {},
      transactionId,
    });
    if (res.status === 'approved') {
      const approved = await UserVerification.approveNafath(user.id, transactionId, integration.id, integration.provider, { confirmed_via: 'nafath' });
      if (!approved) return { ok: false, error: 'invalid_transaction' };
      await UserVerification.audit({ user_id: user.id, method: 'nafath', action: 'confirm', result: 'ok', details: 'transaction_approved', ip });
      return { ok: true, verified: true };
    }
    return { ok: true, verified: false, status: res.status };
  } catch (err) {
    return { ok: false, error: 'poll_failed' };
  }
}

function maskId(id) {
  if (!id) return '';
  const s = String(id);
  if (s.includes('@')) {
    const [u, d] = s.split('@');
    return (u.slice(0, 2) + '***') + '@' + d;
  }
  return s.slice(0, 3) + '****' + s.slice(-2);
}

module.exports = {
  getPolicy, generateOtp,
  startOtp, confirmOtp,
  startNafath, pollNafath,
};
