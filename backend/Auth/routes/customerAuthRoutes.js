const express = require("express");
const customerRegistrationController = require("../controllers/customerRegistrationController");
const validateCustomerRegistration = require("../validators/customerRegistrationValidator");
const { registerLimiters } = require("../../shared/middleware/rateLimit");

const router = express.Router();

router.post(
  "/register",
  ...registerLimiters,
  validateCustomerRegistration,
  customerRegistrationController.register,
);

module.exports = router;
