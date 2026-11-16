const express = require("express");
const paymentController = require("../controllers/paymentController");
const {
  authenticateToken,
  requireCustomerOrAdmin,
  requireCurrentStaffOrAdmin,
} = require("../../Auth/middleware/authMiddleware");
const paymentValidator = require("../validators/paymentValidator");

const router = express.Router();

router.post(
  "/:bookingId/verify",
  authenticateToken,
  requireCurrentStaffOrAdmin,
  paymentValidator.parseBookingId,
  paymentValidator.validateVerification,
  paymentController.verify,
);

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
