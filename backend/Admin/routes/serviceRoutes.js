const express = require("express");
const serviceController = require("../controllers/serviceController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const serviceValidator = require("../validators/serviceValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  serviceValidator.validateListQuery,
  serviceController.list,
);
router.get(
  "/:id/prices",
  serviceValidator.parseId,
  serviceController.getPrices,
);
router.put(
  "/:id/prices",
  serviceValidator.parseId,
  serviceController.ensureExists,
  serviceValidator.validatePrices,
  serviceController.upsertPrices,
);
router.get(
  "/:id",
  serviceValidator.parseId,
  serviceController.getById,
);
router.post(
  "/",
  serviceValidator.validateCreate,
  serviceController.create,
);
router.patch(
  "/:id/status",
  serviceValidator.parseId,
  serviceController.ensureExists,
  serviceValidator.validateStatus,
  serviceController.updateStatus,
);
router.patch(
  "/:id",
  serviceValidator.parseId,
  serviceController.ensureExists,
  serviceValidator.validateUpdate,
  serviceController.update,
);

module.exports = router;
