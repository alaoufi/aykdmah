const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, accountAuthLimiter } = require('../middleware/rateLimiter');
const { validate, sanitizeBody } = require('../middleware/validate');

router.post(
  '/register',
  authLimiter,
  sanitizeBody(['full_name', 'email', 'phone', 'username', 'facebook_id']),
  [
    // Required for the legacy form; optional in onboarding version 2 (checked in the controller).
    body('full_name').optional({ values: 'null' }).isString().isLength({ max: 150 }),
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 4, max: 100 }),
    body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }).matches(/^[+\d\s()-]+$/),
    body('username').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 60 }).matches(/^[\p{L}\p{N}_.-]+$/u),
    body('facebook_id').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 120 }),
    body('role').isIn(['client', 'provider', 'both']),
  ],
  validate,
  authController.register
);

// Login accepts ANY identifier the user signed up with: username,
// email, phone, or facebook_id. The controller does the routing —
// here we only enforce that *something* is present and that it's a
// non-empty string. `email` is kept as a legacy alias for back-compat.
router.post(
  '/login',
  authLimiter,
  accountAuthLimiter,
  sanitizeBody(['identifier', 'email']),
  [
    body('identifier').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 200 }),
    body('email').optional({ checkFalsy: true }).isString().isLength({ min: 1, max: 200 }),
    body('password').isString().isLength({ min: 1, max: 4096 }),
  ],
  validate,
  authController.login
);

router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.put(
  '/password',
  authLimiter,
  authenticate,
  [
    body('current_password').isString().isLength({ min: 1, max: 4096 }),
    body('new_password').isString().isLength({ min: 4, max: 100 }),
  ],
  validate,
  authController.changePassword
);

module.exports = router;
