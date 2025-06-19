// server/routes/auth.js
const express = require('express');
const router = express.Router();
const {
  sendOTP,
  verifyOTP,
  registerUser,
  loginUser
} = require('../controllers/authController');

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;
