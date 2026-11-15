const express = require("express");
const customerProfileController = require("../controllers/profileController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const validateProfileUpdate = require("../validators/profileValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get("/", customerProfileController.getProfile);
router.patch(
  "/",
  validateProfileUpdate,
  customerProfileController.updateProfile,
);

module.exports = router;
