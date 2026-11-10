const MAX_MYSQL_INT = 2147483647;
const MAX_PAGE = 2147483647;
const MAX_LIMIT = 100;
const TRANSACTION_TYPES = new Set(["CREDIT", "DEBIT"]);

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_MYSQL_INT
    ? parsed
    : null;
}

function resolveTargetUser(req, res, next) {
  const rawUserId = req.query.user_id;
  if (req.user.role === "ADMIN") {
    if (rawUserId === undefined) {
      return sendValidationError(
        res,
        "user_id is required for administrator requests.",
      );
    }
    const userId = parsePositiveInteger(rawUserId);
    if (userId === null) {
      return sendValidationError(res, "user_id must be a positive integer.");
    }
    req.walletUserId = userId;
    return next();
  }

  if (
    rawUserId !== undefined &&
    (typeof rawUserId !== "string" ||
      !/^[1-9]\d*$/.test(rawUserId) ||
      Number(rawUserId) !== Number(req.user.user_id))
  ) {
    return res.status(403).json({
      status: "error",
      message: "Customers can access only their own Wallet.",
    });
  }
  req.walletUserId = Number(req.user.user_id);
  return next();
}

function validatePagination(req, res, next) {
  const {
    page: rawPage,
    limit: rawLimit,
    transaction_type: transactionType,
  } = req.query;
  const page =
    rawPage === undefined ? 1 : parsePositiveInteger(rawPage);
  const limit =
    rawLimit === undefined ? 20 : parsePositiveInteger(rawLimit);

  if (
    page === null ||
    limit === null ||
    page > MAX_PAGE ||
    limit > MAX_LIMIT ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    return sendValidationError(res, "Invalid pagination parameters.");
  }
  if (
    transactionType !== undefined &&
    (typeof transactionType !== "string" ||
      !TRANSACTION_TYPES.has(transactionType))
  ) {
    return sendValidationError(
      res,
      "transaction_type must be CREDIT or DEBIT.",
    );
  }

  req.walletPagination = {
    page,
    limit,
    offset: (page - 1) * limit,
    transaction_type: transactionType,
  };
  return next();
}

module.exports = { resolveTargetUser, validatePagination };
