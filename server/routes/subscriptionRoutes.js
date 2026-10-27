const express = require('express');
const router = express.Router();
const c = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');

router.get('/plans', c.listPlans);
router.get('/current', authenticate, c.current);
router.post('/', authenticate, c.subscribe);
router.put('/:id/cancel', authenticate, c.cancel);

module.exports = router;
