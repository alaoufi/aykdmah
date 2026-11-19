const express = require('express');
const router = express.Router();
const c = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');

router.get('/plans', c.listPlans);
router.get('/current', authenticate, c.current);
// Does my work need a subscription in my area? (AYK-042)
router.get('/requirement', authenticate, c.requirement);
router.post('/', authenticate, c.subscribe);
router.put('/:id/cancel', authenticate, c.cancel);

module.exports = router;
