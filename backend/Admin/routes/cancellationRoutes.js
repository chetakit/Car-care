const express = require("express");
const cancellationController = require("../controllers/cancellationController");
const { authenticateToken } = require("../middleware/authMiddleware");
const cancellationValidator = require("../validators/cancellationValidator");

const router = express.Router();

function allowCustomerOrAdmin(req, res, next) {
  if (
    !req.user ||
    (req.user.role !== "CUSTOMER" && req.user.role !== "ADMIN")
  ) {
    return res.status(403).json({
      status: "error",
      message: "Customer or administrator access required.",
    });
  }
  return next();
}

router.use(authenticateToken, allowCustomerOrAdmin);

router.post(
  "/:bookingId",
  cancellationValidator.parseBookingId,
  cancellationValidator.validateCancellation,
  cancellationController.cancel,
);

module.exports = router;
