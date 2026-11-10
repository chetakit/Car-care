const express = require("express");
const walletController = require("../controllers/walletController");
const { authenticateToken } = require("../middleware/authMiddleware");
const walletValidator = require("../validators/walletValidator");

const router = express.Router();

function allowCustomerOrAdmin(req, res, next) {
  if (
    !req.user ||
    (req.user.role !== "CUSTOMER" && req.user.role !== "ADMIN")
  ) {
    return res.status(403).json({
      status: "error",
      message: "Customer or administrator access required.",
    });
  }
  return next();
}

router.use(authenticateToken, allowCustomerOrAdmin);

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
