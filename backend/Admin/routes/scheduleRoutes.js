const express = require("express");
const scheduleController = require("../controllers/scheduleController");
const {
  authenticateToken,
  requireAdmin,
} = require("../../Auth/middleware/authMiddleware");
const scheduleValidator = require("../validators/scheduleValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  scheduleValidator.validateListQuery,
  scheduleController.listCapacity,
);
router.patch(
  "/:id/capacity",
  scheduleValidator.parseId,
  scheduleValidator.validateCapacity,
  scheduleController.updateCapacity,
);

module.exports = router;
