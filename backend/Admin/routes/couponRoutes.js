const express = require("express");
const couponController = require("../controllers/couponController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const couponValidator = require("../validators/couponValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  couponValidator.validateListQuery,
  couponController.list,
);
router.get(
  "/:id/usages",
  couponValidator.parseId,
  couponValidator.validateUsageQuery,
  couponController.listUsages,
);
router.get(
  "/:id",
  couponValidator.parseId,
  couponController.getById,
);
router.post(
  "/",
  couponValidator.validateCreate,
  couponController.create,
);
router.patch(
  "/:id/status",
  couponValidator.parseId,
  couponValidator.validateStatus,
  couponController.updateStatus,
);
router.patch(
  "/:id",
  couponValidator.parseId,
  couponValidator.validateUpdate,
  couponController.update,
);

module.exports = router;
