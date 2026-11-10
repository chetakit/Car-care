const express = require("express");
const reportController = require("../controllers/reportController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const reportValidator = require("../validators/reportValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/bookings",
  reportValidator.validateQuery,
  reportController.bookings,
);
router.get(
  "/revenue",
  reportValidator.validateQuery,
  reportController.revenue,
);

module.exports = router;
