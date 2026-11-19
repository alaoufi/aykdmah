const express = require('express');
const router = express.Router();
const c = require('../controllers/integrationController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');

router.use(authenticate, requireAdmin, requirePermission('integrations.manage'));

router.get('/providers', c.providers);
router.get('/usage', c.usage);
router.get('/', c.list);
router.post('/', c.create);
router.get('/:id', c.get);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/test', c.test);

module.exports = router;
