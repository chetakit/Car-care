const BOOKING_STATUSES = new Set([
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
const PAYMENT_STATUSES = new Set(["PENDING", "PAID", "FAILED"]);
const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseId(req, res, next) {
  const rawId = req.params.id;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  const bookingId = Number(rawId);
  if (!Number.isSafeInteger(bookingId) || bookingId > MAX_MYSQL_INT) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  req.bookingId = bookingId;
  return next();
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

function validateListQuery(req, res, next) {
  const {
    page: rawPage,
    limit: rawLimit,
    search,
    booking_status: bookingStatus,
    payment_status: paymentStatus,
    date_from: dateFrom,
    date_to: dateTo,
    sort,
  } = req.query;
  const page = rawPage === undefined ? 1 : parsePositiveInteger(rawPage);
  const limit = rawLimit === undefined ? 20 : parsePositiveInteger(rawLimit);

  if (
    page === null ||
    limit === null ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    return sendValidationError(res, "Invalid pagination parameters.");
  }
  if (
    search !== undefined &&
    (typeof search !== "string" || Array.from(search.trim()).length > 100)
  ) {
    return sendValidationError(res, "Search must be a string of at most 100 characters.");
  }
  if (
    bookingStatus !== undefined &&
    (typeof bookingStatus !== "string" || !BOOKING_STATUSES.has(bookingStatus))
  ) {
    return sendValidationError(res, "Invalid booking_status.");
  }
  if (
    paymentStatus !== undefined &&
    (typeof paymentStatus !== "string" || !PAYMENT_STATUSES.has(paymentStatus))
  ) {
    return sendValidationError(res, "Invalid payment_status.");
  }
  if (dateFrom !== undefined && !isValidDate(dateFrom)) {
    return sendValidationError(res, "date_from must be a valid YYYY-MM-DD date.");
  }
  if (dateTo !== undefined && !isValidDate(dateTo)) {
    return sendValidationError(res, "date_to must be a valid YYYY-MM-DD date.");
  }
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    return sendValidationError(res, "date_from must not be after date_to.");
  }
  if (sort !== undefined && sort !== "newest" && sort !== "oldest") {
    return sendValidationError(res, "sort must be newest or oldest.");
  }

  req.bookingListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof search === "string" ? search.trim() : "",
    booking_status: bookingStatus,
    payment_status: paymentStatus,
    date_from: dateFrom,
    date_to: dateTo,
    sort: sort || "newest",
  };
  return next();
}

module.exports = { parseId, validateListQuery, isValidDate };
