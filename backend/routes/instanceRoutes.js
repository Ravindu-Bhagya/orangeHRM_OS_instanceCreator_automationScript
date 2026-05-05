const express = require('express');
const router = express.Router();
const { upload } = require('../services/fileService');
const { createInstance, terminalStream } = require('../controllers/instanceController');

router.post('/create-instance', upload.single('zip'), createInstance);
router.get('/terminal/:sessionId', terminalStream);

module.exports = router;
