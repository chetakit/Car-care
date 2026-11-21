const express = require("express");
const authController = require("../controllers/authController");
const validateLogin = require("../validators/authValidator");
const { loginLimiters } = require("../../shared/middleware/rateLimit");

const router = express.Router();

// loginLimiters: too many wrong passwords -> 429 for a while (rateLimit.js).
router.post("/login", ...loginLimiters, validateLogin, authController.login);

module.exports = router;
