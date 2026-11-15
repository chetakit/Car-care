const express = require("express");
const catalogController = require("../controllers/catalogController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const catalogValidator = require("../validators/catalogValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get(
  "/vehicle-types",
  catalogValidator.validateNoQuery,
  catalogController.vehicleTypes,
);
router.get(
  "/vehicle-brands",
  catalogValidator.validateNoQuery,
  catalogController.vehicleBrands,
);
router.get(
  "/vehicle-models",
  catalogValidator.validateModelFilters,
  catalogController.vehicleModels,
);

module.exports = router;
