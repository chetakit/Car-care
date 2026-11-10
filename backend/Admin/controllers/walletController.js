const walletService = require("../services/walletService");

function handleError(res, error) {
  console.error(
    "Wallet request failed.",
    error && typeof error.code === "string"
      ? error.code
      : error instanceof Error
        ? error.name
        : "UnknownError",
  );
  return res.status(500).json({
    status: "error",
    message: "Unable to process Wallet request.",
  });
}

async function getBalance(req, res) {
  try {
    const data = await walletService.getBalance(req.walletUserId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getTransactions(req, res) {
  try {
    const data = await walletService.getTransactions({
      userId: req.walletUserId,
      ...req.walletPagination,
    });
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getRefunds(req, res) {
  try {
    const data = await walletService.getRefunds({
      userId: req.walletUserId,
      ...req.walletPagination,
    });
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { getBalance, getTransactions, getRefunds };
