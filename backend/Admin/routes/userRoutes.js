const express = require("express");
const userController = require("../controllers/userController");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const userValidator = require("../validators/userValidator");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get("/", userValidator.validateListQuery, userController.list);
router.get("/:id", userValidator.parseId, userController.getById);
router.patch(
  "/:id/role",
  userValidator.parseId,
  userValidator.validateRole,
  userController.updateRole,
);
router.patch(
  "/:id/status",
  userValidator.parseId,
  userValidator.validateStatus,
  userController.updateStatus,
);
router.patch(
  "/:id",
  userValidator.parseId,
  userValidator.validateUpdate,
  userController.update,
);

module.exports = router;
