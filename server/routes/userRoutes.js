const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/roleCheck');
const { body } = require('express-validator');
const { validate, sanitizeBody } = require('../middleware/validate');
const { requireMarketplaceBrowse } = require('../middleware/verificationPolicy');

const accountValidators = () => [
  body('full_name').optional().isString().bail().isLength({ min: 2, max: 150 }),
  body('username').optional({ nullable: true, checkFalsy: true }).isString().bail().isLength({ min: 1, max: 60 }).matches(/^[\p{L}\p{N}_.-]+$/u),
  body('email').optional({ nullable: true, checkFalsy: true }).isString().bail().isEmail().normalizeEmail(),
  body('phone').optional({ nullable: true, checkFalsy: true }).isString().bail().isLength({ max: 30 }).matches(/^[+\d\s()-]+$/).customSanitizer(value => value.replace(/[\s()-]/g, '')),
  body('facebook_id').optional({ nullable: true, checkFalsy: true }).isString().bail().isLength({ min: 1, max: 120 }),
  body('password').optional({ checkFalsy: true }).isString().bail().isLength({ min: 6, max: 100 }),
  body('role').optional().isIn(['client', 'provider', 'admin']),
  ...['is_active', 'is_blocked', 'is_verified'].map(field => body(field).optional().custom(value => [true, false, 0, 1].includes(value))),
];
const accountValidation = [sanitizeBody(['full_name', 'username', 'email', 'phone', 'facebook_id']), accountValidators(), validate];

const gate = [authenticate, requireAdmin, requirePermission('users.manage')];
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647) return res.status(400).json({ success: false, message: req.t('invalid_data') });
  next();
});

router.get('/',                ...gate, userController.list);
router.post('/',               ...gate, ...accountValidation, userController.createByAdmin);
router.put('/me', authenticate, userController.updateMe);
router.put('/me/provider', authenticate, userController.updateProvider);
router.get('/:id', optionalAuth, requireMarketplaceBrowse, userController.getOne);
router.put('/:id',             ...gate, ...accountValidation, userController.updateByAdmin);
router.get('/:id/reviews', optionalAuth, requireMarketplaceBrowse, userController.getProviderReviews);
router.post('/:id/block',      ...gate, userController.block);
router.post('/:id/unblock',    ...gate, userController.unblock);
router.delete('/:id',          ...gate, userController.remove);

module.exports = router;
