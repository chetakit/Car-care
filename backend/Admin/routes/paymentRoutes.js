const express = require("express");
const paymentController = require("../controllers/paymentController");
const { authenticateToken } = require("../middleware/authMiddleware");
const paymentValidator = require("../validators/paymentValidator");

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

router.get(
  "/:bookingId",
  paymentValidator.parseBookingId,
  paymentController.getByBookingId,
);
router.post(
  "/:bookingId",
  paymentValidator.parseBookingId,
  paymentValidator.validateCreate,
  paymentController.createForBooking,
);
router.post(
  "/:bookingId/simulate",
  paymentValidator.parseBookingId,
  paymentValidator.validateSimulation,
  paymentController.simulate,
);
router.post(
  "/:bookingId/wallet",
  paymentValidator.parseBookingId,
  paymentValidator.validateWalletPayment,
  paymentController.payWithWallet,
);

module.exports = router;
