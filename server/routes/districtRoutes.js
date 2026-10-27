const express = require('express');
const router = express.Router();
const c = require('../controllers/districtController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');

const gate = [authenticate, requireAdmin, requirePermission('locations.manage')];

router.get('/', c.list);
router.get('/:id', c.getOne);
router.post('/',     ...gate, c.create);
router.put('/:id',   ...gate, c.update);
router.delete('/:id',...gate, c.remove);

module.exports = router;
