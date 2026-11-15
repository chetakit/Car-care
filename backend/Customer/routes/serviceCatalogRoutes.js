const express = require("express");
const serviceCatalogController = require("../controllers/serviceCatalogController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const serviceCatalogValidator = require("../validators/serviceCatalogValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get("/", serviceCatalogValidator.validateNoQuery, serviceCatalogController.list);
router.get(
  "/:serviceId/prices",
  serviceCatalogValidator.validatePriceParams,
  serviceCatalogController.prices,
);

module.exports = router;
