const express = require("express");
const bookingController = require("../controllers/bookingController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const bookingValidator = require("../validators/bookingValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  bookingValidator.validateListQuery,
  bookingController.list,
);
router.get(
  "/:id/history",
  bookingValidator.parseId,
  bookingController.getHistory,
);
router.get(
  "/:id",
  bookingValidator.parseId,
  bookingController.getById,
);

module.exports = router;
