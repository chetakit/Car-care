const express = require("express");
const bookingController = require("../controllers/bookingController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const bookingValidator = require("../validators/bookingValidator");

const router = express.Router();

router.post(
  "/bookings",
  authenticateToken,
  requireCustomer,
  bookingValidator.validateCreate,
  bookingController.create,
);

module.exports = router;
