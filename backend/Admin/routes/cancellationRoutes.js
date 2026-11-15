const express = require("express");
const cancellationController = require("../controllers/cancellationController");
const {
  authenticateToken,
  requireCustomerOrAdmin,
} = require("../../Auth/middleware/authMiddleware");
const cancellationValidator = require("../validators/cancellationValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomerOrAdmin);

router.post(
  "/:bookingId",
  cancellationValidator.parseBookingId,
  cancellationValidator.validateCancellation,
  cancellationController.cancel,
);

module.exports = router;
