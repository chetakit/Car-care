const express = require("express");
const vehicleModelController = require("../controllers/vehicleModelController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const vehicleModelValidator = require("../validators/vehicleModelValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  vehicleModelValidator.validateListQuery,
  vehicleModelController.list,
);
router.get(
  "/:id",
  vehicleModelValidator.parseId,
  vehicleModelController.getById,
);
router.post(
  "/",
  vehicleModelValidator.validateCreate,
  vehicleModelController.create,
);
router.patch(
  "/:id/status",
  vehicleModelValidator.parseId,
  vehicleModelController.ensureExists,
  vehicleModelValidator.validateStatus,
  vehicleModelController.updateStatus,
);
router.patch(
  "/:id",
  vehicleModelValidator.parseId,
  vehicleModelController.ensureExists,
  vehicleModelValidator.validateUpdate,
  vehicleModelController.update,
);

module.exports = router;
