const express = require("express");
const authController = require("../controllers/authController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const validateLogin = require("../validators/authValidator");

const router = express.Router();

router.post("/login", validateLogin, authController.login);
router.get("/me", authenticateToken, requireAdmin, authController.me);
router.post("/logout", authenticateToken, requireAdmin, authController.logout);

module.exports = router;
