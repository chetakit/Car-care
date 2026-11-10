const MAX_MYSQL_INT = 2147483647;
const PAYMENT_METHODS = new Set([
  "CASH",
  "BANK_TRANSFER",
  "WALLET",
  "SIMULATED",
]);
const SIMULATED_RESULTS = new Set(["PAID", "FAILED"]);

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parseBookingId(req, res, next) {
  const rawId = req.params.bookingId;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "bookingId must be a positive integer.");
  }
  const bookingId = Number(rawId);
  if (!Number.isSafeInteger(bookingId) || bookingId > MAX_MYSQL_INT) {
    return sendValidationError(res, "bookingId must be a positive integer.");
  }
  req.bookingId = bookingId;
  return next();
}

function hasOnlyKeys(body, allowedKeys) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => allowedKeys.has(key))
  );
}

function validateCreate(req, res, next) {
  const body = req.body;
  if (!hasOnlyKeys(body, new Set(["payment_method"]))) {
    return sendValidationError(
      res,
      "Only payment_method is allowed; amount is determined from the booking.",
    );
  }
  if (!PAYMENT_METHODS.has(body.payment_method)) {
    return sendValidationError(
      res,
      "payment_method must be CASH, BANK_TRANSFER, WALLET, or SIMULATED.",
    );
  }
  req.paymentCreateInput = { payment_method: body.payment_method };
  return next();
}

function validateSimulation(req, res, next) {
  const body = req.body;
  if (!hasOnlyKeys(body, new Set(["payment_status"]))) {
    return sendValidationError(
      res,
      "Only payment_status is allowed for simulated payments.",
    );
  }
  if (!SIMULATED_RESULTS.has(body.payment_status)) {
    return sendValidationError(
      res,
      "payment_status must be PAID or FAILED for simulated payments.",
    );
  }
  req.paymentSimulationInput = { payment_status: body.payment_status };
  return next();
}

function validateWalletPayment(req, res, next) {
  const body = req.body;
  if (
    body !== undefined &&
    (body === null ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length > 0)
  ) {
    return sendValidationError(
      res,
      "Wallet payment does not accept a request body or client-supplied amount.",
    );
  }
  return next();
}

module.exports = {
  parseBookingId,
  validateCreate,
  validateSimulation,
  validateWalletPayment,
};
