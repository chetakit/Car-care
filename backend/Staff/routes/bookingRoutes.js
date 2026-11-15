const express = require("express");
const bookingController = require("../controllers/bookingController");
const {
  authenticateToken,
  requireCurrentStaff,
} = require("../../Auth/middleware/authMiddleware");
const bookingValidator = require("../validators/bookingValidator");

const router = express.Router();

router.use(authenticateToken, requireCurrentStaff);

router.get("/", bookingValidator.validateListQuery, bookingController.list);
router.get("/:id", bookingValidator.parseId, bookingController.getById);
router.patch(
  "/:id/status",
  bookingValidator.parseId,
  bookingValidator.validateStatus,
  bookingController.updateStatus,
);

module.exports = router;
