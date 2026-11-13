const express = require('express');
const router = express.Router();
const c = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, c.list);
router.put('/:id/read', authenticate, c.markRead);
router.put('/read-all', authenticate, c.markAllRead);

module.exports = router;
