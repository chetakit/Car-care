const express = require("express");
const customerRegistrationController = require("../controllers/customerRegistrationController");
const validateCustomerRegistration = require("../validators/customerRegistrationValidator");

const router = express.Router();

router.post(
  "/register",
  validateCustomerRegistration,
  customerRegistrationController.register,
);

module.exports = router;
