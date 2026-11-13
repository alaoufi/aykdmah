const express = require('express');
const router = express.Router();
const c = require('../controllers/countryController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');

const gate = [authenticate, requireAdmin, requirePermission('countries.manage')];

// Public — used by the register form, hero search and language switcher
router.get('/', c.listPublic);

// Admin CRUD
router.get('/admin/all',  ...gate, c.listAll);
router.post('/reorder',   ...gate, c.reorder);
router.post('/',          ...gate, c.create);
router.put('/:id',        ...gate, c.update);
router.delete('/:id',     ...gate, c.remove);

module.exports = router;
