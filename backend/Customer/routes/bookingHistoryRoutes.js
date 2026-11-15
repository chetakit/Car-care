const express = require("express");
const bookingHistoryController = require("../controllers/bookingHistoryController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const bookingHistoryValidator = require("../validators/bookingHistoryValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get(
  "/bookings",
  bookingHistoryValidator.validateListQuery,
  bookingHistoryController.list,
);
router.get(
  "/vehicles/:vehicleId/bookings",
  bookingHistoryValidator.parseVehicleId,
  bookingHistoryValidator.validateListQuery,
  bookingHistoryController.vehicleBookings,
);

module.exports = router;
