const express = require("express");
const authController = require("../controllers/authController");
const sessionController = require("../controllers/sessionController");
const {
  authenticateToken,
  requireSupportedSessionRole,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/me",
  authenticateToken,
  requireSupportedSessionRole,
  sessionController.me,
);
router.post(
  "/logout",
  authenticateToken,
  requireSupportedSessionRole,
  authController.logout,
);

module.exports = router;
