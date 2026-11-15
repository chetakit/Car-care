const express = require("express");
const authController = require("../controllers/authController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const loginRoutes = require("./loginRoutes");

const router = express.Router();

router.use(loginRoutes);
router.get("/me", authenticateToken, requireAdmin, authController.me);
router.post("/logout", authenticateToken, requireAdmin, authController.logout);

module.exports = router;
