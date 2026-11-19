const Subscription = require('../models/Subscription');
const { success, created, notFound, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { validId } = require('../models/Payment');

const listPlans = asyncHandler(async (req, res) => {
  const items = await Subscription.listPlans(true);
  return success(res, items);
});

const subscribe = asyncHandler(async (req, res) => {
  const { plan_id } = req.body;
  if (req.user.role !== 'provider') return error(res, req.t('forbidden'), 403);
  if (!validId(plan_id)) return error(res, req.t('invalid_data'), 400);
  const plan = await Subscription.findPlanById(plan_id);
  if (!plan || !plan.is_active) return notFound(res, req.t('plan_not_found'));

  const sub = await Subscription.createSubscription({
    user_id: req.user.id, plan_id, amount: plan.price,
  });

  if (Number(plan.price) === 0) {
    const activated = await Subscription.activateSubscription(sub.id);
    return created(res, activated, req.t('free_subscribed'));
  }
  return created(res, sub, req.t('sub_created_pay'));
});

const cancel = asyncHandler(async (req, res) => {
  await Subscription.cancel(req.params.id, req.user.id);
  return success(res, null, req.t('sub_cancelled'));
});

const current = asyncHandler(async (req, res) => {
  const sub = await Subscription.getActiveForUser(req.user.id);
  return success(res, sub);
});

const requirement = asyncHandler(async (req, res) => {
  if (req.user.role !== 'provider') return success(res, { enabled: false, required_category_ids: [], subscribed: false });
  return success(res, await require('../services/subscriptionRules').statusFor(req.user.id));
});

module.exports = { listPlans, subscribe, cancel, current, requirement };
