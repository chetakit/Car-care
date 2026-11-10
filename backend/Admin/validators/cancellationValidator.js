const MAX_MYSQL_INT = 2147483647;
const MAX_REASON_LENGTH = 5000;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parseBookingId(req, res, next) {
  const rawId = req.params.bookingId;
  if (typeof rawId !== "string" || !/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "bookingId must be a positive integer.");
  }
  const bookingId = Number(rawId);
  if (!Number.isSafeInteger(bookingId) || bookingId > MAX_MYSQL_INT) {
    return sendValidationError(res, "bookingId must be a positive integer.");
  }
  req.bookingId = bookingId;
  return next();
}

function validateCancellation(req, res, next) {
  const body = req.body === undefined ? {} : req.body;
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "reason")
  ) {
    return sendValidationError(
      res,
      "Only an optional reason is accepted; refund amounts are calculated by the server.",
    );
  }

  const reason = body.reason;
  if (
    reason !== undefined &&
    (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)
  ) {
    return sendValidationError(
      res,
      `reason must be a string of at most ${MAX_REASON_LENGTH} characters.`,
    );
  }
  req.cancellationInput = {
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  };
  return next();
}

module.exports = { parseBookingId, validateCancellation };
