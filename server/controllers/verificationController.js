const verificationService = require('../services/verificationService');
const UserVerification = require('../models/UserVerification');
const { success, error, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const SUPPORTED_OTP_METHODS = ['sms', 'whatsapp', 'email'];

// GET /verify/policy
const getPolicy = asyncHandler(async (req, res) => {
  const policy = await verificationService.getPolicy();
  return success(res, policy);
});

// GET /verify/status
const getStatus = asyncHandler(async (req, res) => {
  const [status, policy] = await Promise.all([
    UserVerification.getStatus(req.user.id),
    verificationService.getPolicy(),
  ]);
  return success(res, { status, policy });
});

// POST /verify/:method/start
// body: { identifier? }   — phone or email; default to user's stored value
const start = asyncHandler(async (req, res) => {
  const method = req.params.method;
  if (!SUPPORTED_OTP_METHODS.includes(method)) return error(res, req.t('invalid_data'));

  let identifier = (req.body.identifier || '').trim();
  if (!identifier) {
    if (method === 'email') identifier = req.user.email;
    else identifier = req.user.phone;
  }
  if (!identifier) return error(res, req.t('invalid_data'));

  const result = await verificationService.startOtp({
    user: req.user, method, identifier,
    ip: req.ip || null, locale: req.lang || 'ar',
  });
  if (!result.ok) return error(res, req.t(result.error) || result.error, result.error === 'throttled' ? 429 : 400);
  return success(res, result);
});

// POST /verify/:method/confirm
// body: { code }
const confirm = asyncHandler(async (req, res) => {
  const method = req.params.method;
  if (!SUPPORTED_OTP_METHODS.includes(method)) return error(res, req.t('invalid_data'));
  const code = String(req.body.code || '').trim();
  if (!code) return error(res, req.t('invalid_data'));

  const result = await verificationService.confirmOtp({
    user: req.user, method, code, ip: req.ip || null,
  });
  if (!result.ok) {
    const reason = result.reason || 'invalid_code';
    return error(res, req.t(reason) || reason, 400);
  }
  return success(res, { verified: true }, req.t('updated'));
});

// POST /verify/nafath/start  body: { national_id }
const nafathStart = asyncHandler(async (req, res) => {
  const nid = String(req.body.national_id || '').trim();
  if (!nid) return error(res, req.t('invalid_data'));
  const result = await verificationService.startNafath({ user: req.user, nationalId: nid, ip: req.ip });
  if (!result.ok) return error(res, result.details || result.error);
  return success(res, { transactionId: result.transactionId, code: result.code });
});

// POST /verify/nafath/poll  body: { transaction_id }
const nafathPoll = asyncHandler(async (req, res) => {
  const tx = String(req.body.transaction_id || '').trim();
  if (!tx) return error(res, req.t('invalid_data'));
  const result = await verificationService.pollNafath({ user: req.user, transactionId: tx, ip: req.ip });
  if (!result.ok) return error(res, result.details || result.error);
  return success(res, result);
});

// GET /verify/audit
const myAudit = asyncHandler(async (req, res) => {
  const items = await UserVerification.listAudit(req.user.id);
  return success(res, items);
});

module.exports = { getPolicy, getStatus, start, confirm, nafathStart, nafathPoll, myAudit };
