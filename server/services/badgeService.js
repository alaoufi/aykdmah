// Badge programme orchestration.
//
// A badge moves through these states:
//   requested  → admin approves → approved
//   approved   → provider pays  → active  (until ends_at)
//                admin rejects  → rejected
//   active     → ends_at passes → expired
//
// Pricing & insurance policy come from /admin/settings.

const Setting = require('../models/Setting');
const ProviderBadge = require('../models/ProviderBadge');
const { money } = require('../models/Payment');
const paymentService = require('./paymentService');

const BADGE_TYPES = ['trusted', 'featured'];

async function getConfig() {
  const keys = [
    'badges_enabled',
    'badge_trusted_monthly_fee',  'badge_trusted_insurance_required',  'badge_trusted_insurance_amount',
    'badge_featured_monthly_fee', 'badge_featured_insurance_required', 'badge_featured_insurance_amount',
    'badge_duration_days',
  ];
  const s = await Setting.getMany(keys);
  const num = (v, fb) => v == null ? fb : money(v);
  const duration = Number(s.badge_duration_days ?? 30);
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 3650) throw Object.assign(new Error('Invalid badge duration'), { status: 400 });
  return {
    enabled: s.badges_enabled !== false,
    duration_days: duration,
    trusted: {
      monthly_fee: num(s.badge_trusted_monthly_fee, 49),
      insurance_required: !!s.badge_trusted_insurance_required,
      insurance_amount:   num(s.badge_trusted_insurance_amount, 0),
    },
    featured: {
      monthly_fee: num(s.badge_featured_monthly_fee, 99),
      insurance_required: !!s.badge_featured_insurance_required,
      insurance_amount:   num(s.badge_featured_insurance_amount, 0),
    },
  };
}

async function request({ user, badge_type, notes }) {
  if (user.role !== 'provider') return { ok: false, error: 'forbidden' };
  if (notes != null && (typeof notes !== 'string' || notes.length > 10000)) return { ok: false, error: 'invalid_data' };
  if (!BADGE_TYPES.includes(badge_type)) {
    return { ok: false, error: 'invalid_type' };
  }
  const cfg = await getConfig();
  if (!cfg.enabled) return { ok: false, error: 'disabled' };
  await sweep();
  const open = await ProviderBadge.findOpenForType(user.id, badge_type);
  if (open) return { ok: false, error: 'already_in_flight', existing: open };

  const policy = cfg[badge_type];
  const badge = await ProviderBadge.create({
    user_id: user.id,
    badge_type,
    monthly_fee:        policy.monthly_fee,
    insurance_required: policy.insurance_required,
    insurance_amount:   policy.insurance_required ? policy.insurance_amount : 0,
    notes,
  });
  if (!badge) return { ok: false, error: 'already_in_flight' };
  return { ok: true, badge };
}

async function approve({ badgeId, adminId }) {
  const badge = await ProviderBadge.findById(badgeId);
  if (!badge) return { ok: false, error: 'not_found' };
  if (badge.status !== 'requested') return { ok: false, error: 'wrong_state', state: badge.status };
  const updated = await ProviderBadge.approve(badgeId, adminId);
  return updated ? { ok: true, badge: updated } : { ok: false, error: 'wrong_state' };
}

async function reject({ badgeId, adminId, reason }) {
  const badge = await ProviderBadge.findById(badgeId);
  if (!badge) return { ok: false, error: 'not_found' };
  if (!['requested', 'approved', 'awaiting_payment'].includes(badge.status)) {
    return { ok: false, error: 'wrong_state', state: badge.status };
  }
  const updated = await ProviderBadge.reject(badgeId, adminId, reason);
  return updated ? { ok: true, badge: updated } : { ok: false, error: 'wrong_state' };
}

// No payment or entitlement is created until a real gateway is implemented.
async function pay({ user, badgeId }) {
  const badge = await ProviderBadge.findById(badgeId);
  if (!badge) return { ok: false, error: 'not_found' };
  if (badge.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (badge.status !== 'approved') return { ok: false, error: 'wrong_state', state: badge.status };

  return { ok: false, error: 'payment_not_configured', ...paymentService.getAvailability() };
}

async function cancel({ user, badgeId }) {
  const badge = await ProviderBadge.findById(badgeId);
  if (!badge) return { ok: false, error: 'not_found' };
  if (badge.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (!['requested', 'approved', 'awaiting_payment'].includes(badge.status)) {
    return { ok: false, error: 'wrong_state', state: badge.status };
  }
  const updated = await ProviderBadge.cancel(badgeId);
  return updated ? { ok: true, badge: updated } : { ok: false, error: 'wrong_state' };
}

// Used by both provider self-view and the admin list to lazily expire
// any badges whose ends_at has passed.
async function sweep() {
  await ProviderBadge.expireOverdue();
}

module.exports = {
  BADGE_TYPES, getConfig, request, approve, reject, pay, cancel, sweep,
};
