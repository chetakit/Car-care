const express = require("express");
const vehicleTypeController = require("../controllers/vehicleTypeController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const vehicleTypeValidator = require("../validators/vehicleTypeValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get("/", vehicleTypeValidator.validateListQuery, vehicleTypeController.list);
router.get("/:id", vehicleTypeValidator.parseId, vehicleTypeController.getById);
router.post("/", vehicleTypeValidator.validateCreate, vehicleTypeController.create);
router.patch(
  "/:id/status",
  vehicleTypeValidator.parseId,
  vehicleTypeValidator.validateStatus,
  vehicleTypeController.updateStatus,
);
router.patch(
  "/:id",
  vehicleTypeValidator.parseId,
  vehicleTypeValidator.validateUpdate,
  vehicleTypeController.update,
);

module.exports = router;
