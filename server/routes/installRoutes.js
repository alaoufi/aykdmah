// HTTP installation, shared-key recovery and test-data mutation are retired.
// Deployment setup uses the trusted local CLI.
const router = require('express').Router();
router.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
module.exports = router;
