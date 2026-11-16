const BOOKING_STATUSES = new Set([
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
const LIST_QUERY_FIELDS = new Set([
  "page",
  "limit",
  "booking_status",
  "sort",
]);
const MAX_MYSQL_INT = 2147483647;

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

function parseVehicleId(req, res, next) {
  const vehicleId = parsePositiveInteger(req.params.vehicleId);
  if (vehicleId === null) {
    return sendValidationError(res, "vehicleId must be a positive integer.");
  }

  req.vehicleId = vehicleId;
  return next();
}

function validateListQuery(req, res, next) {
  for (const field of Object.keys(req.query)) {
    if (!LIST_QUERY_FIELDS.has(field)) {
      return sendValidationError(
        res,
        "Request contains unsupported query parameters.",
      );
    }
  }

  const page =
    req.query.page === undefined ? 1 : parsePositiveInteger(req.query.page);
  const limit =
    req.query.limit === undefined ? 20 : parsePositiveInteger(req.query.limit);
  if (
    page === null ||
    limit === null ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    return sendValidationError(res, "Invalid pagination parameters.");
  }

  const bookingStatus = req.query.booking_status;
  if (
    bookingStatus !== undefined &&
    (typeof bookingStatus !== "string" ||
      !BOOKING_STATUSES.has(bookingStatus))
  ) {
    return sendValidationError(res, "Invalid booking_status.");
  }

  const sort = req.query.sort;
  if (
    sort !== undefined &&
    (typeof sort !== "string" || (sort !== "newest" && sort !== "oldest"))
  ) {
    return sendValidationError(res, "sort must be newest or oldest.");
  }

  req.bookingHistoryQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    booking_status: bookingStatus,
    sort: sort || "newest",
  };
  return next();
}

module.exports = { parseVehicleId, validateListQuery };
