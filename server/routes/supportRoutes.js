const express = require('express');
const router = express.Router();
const c = require('../controllers/supportController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

// Messages to the administration, the writer's side (AYK-046).
// AYK-437: a tap on the support WhatsApp icon, signed in or not.
router.post('/whatsapp', optionalAuth, generalLimiter, c.logWhatsApp);
router.get('/', authenticate, c.listMine);
router.get('/unread', authenticate, c.unreadMine);
router.post('/', authenticate, generalLimiter, c.create);
router.get('/:id', authenticate, c.getMine);
router.post('/:id/messages', authenticate, generalLimiter, c.replyMine);

module.exports = router;
