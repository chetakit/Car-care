const express = require("express");
const vehicleBrandController = require("../controllers/vehicleBrandController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const vehicleBrandValidator = require("../validators/vehicleBrandValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get("/", vehicleBrandValidator.validateListQuery, vehicleBrandController.list);
router.get("/:id", vehicleBrandValidator.parseId, vehicleBrandController.getById);
router.post("/", vehicleBrandValidator.validateCreate, vehicleBrandController.create);
router.patch(
  "/:id/status",
  vehicleBrandValidator.parseId,
  vehicleBrandValidator.validateStatus,
  vehicleBrandController.updateStatus,
);
router.patch(
  "/:id",
  vehicleBrandValidator.parseId,
  vehicleBrandValidator.validateUpdate,
  vehicleBrandController.update,
);

module.exports = router;
