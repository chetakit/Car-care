const express = require("express");
const walletController = require("../controllers/walletController");
const {
  authenticateToken,
  requireCustomerOrAdmin,
} = require("../../Auth/middleware/authMiddleware");
const walletValidator = require("../validators/walletValidator");

const router = express.Router();

router.use(authenticateToken, requireCustomerOrAdmin);

router.get(
  "/",
  walletValidator.resolveTargetUser,
  walletController.getBalance,
);
router.get(
  "/transactions",
  walletValidator.resolveTargetUser,
  walletValidator.validatePagination,
  walletController.getTransactions,
);
router.get(
  "/refunds",
  walletValidator.resolveTargetUser,
  walletValidator.validatePagination,
  walletController.getRefunds,
);

module.exports = router;
