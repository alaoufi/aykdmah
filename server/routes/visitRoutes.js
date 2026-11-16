// Visitor counter (AYK-244). POST counts this visitor (once a day) and keeps it "online";
// both return the counter only when it is public or the viewer has an admin account.
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const visitors = require('../services/visitors');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

async function answer(req, res) {
  if (!await visitors.canSee(req)) return success(res, { visible: false });
  return success(res, { visible: true, ...(await visitors.stats()) });
}

router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  await visitors.recordVisit(req).catch(() => {});
  return answer(req, res);
}));
router.get('/', optionalAuth, asyncHandler(async (req, res) => answer(req, res)));

module.exports = router;
