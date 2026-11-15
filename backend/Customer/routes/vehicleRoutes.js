const express = require("express");
const vehicleController = require("../controllers/vehicleController");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const vehicleValidator = require("../validators/vehicleValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomer);
router.get("/", vehicleController.list);
router.post("/", vehicleValidator.validateCreate, vehicleController.create);
router.patch(
  "/:vehicleId",
  vehicleValidator.parseId,
  vehicleValidator.validateUpdate,
  vehicleController.update,
);
router.delete(
  "/:vehicleId",
  vehicleValidator.parseId,
  vehicleController.remove,
);

module.exports = router;
