const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, value) => {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) return res.status(422).json({ success: false, message: 'invalid_id' });
  next();
});

const c = require('../controllers/disputeController');
const { authenticate } = require('../middleware/auth');
const { uploadDispute } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// Anyone (client/provider/admin) can open a dispute on their order
router.post('/', c.openDispute);
router.get('/', c.listDisputes);
router.get('/:id', c.getDispute);

// Timeline (status logs + messages + evidence) — visible to both parties
router.get('/:id/timeline', c.timeline);

// Messages — both parties + admin
router.post('/:id/messages', c.postMessage);

// Evidence upload — both parties + admin
router.post('/:id/evidence', uploadLimiter, uploadDispute.array('files', 6), c.uploadEvidence);

// Admin-only controlled access + workflow
router.post('/:id/access', c.requestChatAccess);
router.get('/:id/conversation', c.getDisputeConversation);
router.get('/:id/access-logs', c.getAccessLogs);
router.put('/:id/status', c.changeStatus);
router.put('/:id/resolve', c.resolveDispute);
router.put('/:id/close', c.closeDispute);

module.exports = router;
