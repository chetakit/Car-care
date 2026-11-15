const registrationService = require("../services/customerRegistrationService");

async function register(req, res) {
  try {
    const user = await registrationService.registerCustomer(
      req.customerRegistration,
    );
    return res.status(201).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    if (error instanceof registrationService.DuplicateCustomerEmailError) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists.",
      });
    }

    console.error("Customer registration failed due to an internal error.");
    return res.status(500).json({
      status: "error",
      message: "Unable to process registration request.",
    });
  }
}

module.exports = { register };
