const express = require("express");
const paymentController = require("../controllers/paymentController");
const {
  authenticateToken,
  requireCustomerOrAdmin,
} = require("../../Auth/middleware/authMiddleware");
const paymentValidator = require("../validators/paymentValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomerOrAdmin);

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
