const express = require("express");
const scheduleController = require("../controllers/scheduleController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const scheduleValidator = require("../validators/scheduleValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get(
  "/availability",
  scheduleValidator.validateAvailabilityQuery,
  scheduleController.availability,
);

module.exports = router;
