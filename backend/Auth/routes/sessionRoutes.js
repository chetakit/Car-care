const express = require("express");
const authController = require("../controllers/authController");
const sessionController = require("../controllers/sessionController");
const {
  authenticateToken,
  // [STAFF] เดิมใช้ requireCustomerOrAdmin -> เปลี่ยนเป็น requireAnySignedInRole
  //         เพื่อให้ STAFF เรียก /me และ /logout ได้ด้วย
  requireAnySignedInRole,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/me",
  authenticateToken,
  requireAnySignedInRole,
  sessionController.me,
);
router.post(
  "/logout",
  authenticateToken,
  requireAnySignedInRole,
  authController.logout,
);

module.exports = router;
