const express = require('express');
const router = express.Router();
const c = require('../controllers/chatController');
const loc = require('../controllers/locationController');
const { authenticate } = require('../middleware/auth');
const { uploadChat } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { requireMarketplaceWrite } = require('../middleware/verificationPolicy');

router.get('/conversations', authenticate, c.listConversations);
router.get('/unread', authenticate, c.unreadCount);
router.get('/conversations/:id/messages/:messageId/translation', authenticate, c.translateMessage);
router.post('/conversations/:id/nudge', authenticate, requireMarketplaceWrite, c.nudge);
router.post('/conversations/:id/messages/:messageId/forward', authenticate, requireMarketplaceWrite, c.forwardMessage);
router.post('/conversations', authenticate, requireMarketplaceWrite, c.createConversation);
router.get('/conversations/:id', authenticate, c.getConversation);
router.get('/conversations/:id/messages', authenticate, c.getMessages);
router.post('/conversations/:id/messages', authenticate, requireMarketplaceWrite, uploadLimiter, uploadChat.array('files', 4), c.sendMessage);
router.delete('/conversations/:id/messages/:messageId', authenticate, c.deleteMessage);
router.get('/conversations/:id/search', authenticate, c.searchMessages);
router.put('/conversations/:id/read', authenticate, c.markRead);

// Live location share endpoints (scoped to a conversation)
router.post('/conversations/:id/location', authenticate, requireMarketplaceWrite, loc.shareInConversation);
router.get('/conversations/:id/location/latest', authenticate, loc.getLatestForConversation);
router.delete('/conversations/:id/location', authenticate, loc.stopSharing);

module.exports = router;
