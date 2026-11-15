const express = require("express");
const authController = require("../controllers/authController");
const sessionController = require("../controllers/sessionController");
const {
  authenticateToken,
  requireCustomerOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/me",
  authenticateToken,
  requireCustomerOrAdmin,
  sessionController.me,
);
router.post(
  "/logout",
  authenticateToken,
  requireCustomerOrAdmin,
  authController.logout,
);

module.exports = router;
