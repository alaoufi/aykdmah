const express = require('express');
const router = express.Router();
const c = require('../controllers/categoryController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');

const adminGate = [authenticate, requireAdmin, requirePermission('categories.manage')];

router.get('/', c.list);
router.get('/:id', c.getOne);
router.post('/',     ...adminGate, c.create);
router.put('/:id',   ...adminGate, c.update);
router.delete('/:id',...adminGate, c.remove);

module.exports = router;
