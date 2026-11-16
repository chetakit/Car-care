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

function validateListQuery(req, res, next) {
  const { from, to } = req.query;
  if (Object.keys(req.query).some((field) => !["from", "to"].includes(field))) {
    return sendValidationError(
      res,
      "Only from and to query parameters are supported.",
    );
  }
  if (!isValidDate(from)) {
    return sendValidationError(
      res,
      "from must be a valid date in YYYY-MM-DD format.",
    );
  }
  if (!isValidDate(to)) {
    return sendValidationError(
      res,
      "to must be a valid date in YYYY-MM-DD format.",
    );
  }
  if (from > to) {
    return sendValidationError(res, "from must be on or before to.");
  }

  req.scheduleDateRange = { from, to };
  return next();
}

function parseId(req, res, next) {
  const rawId = req.params.id;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  const scheduleId = Number(rawId);
  if (!Number.isSafeInteger(scheduleId) || scheduleId > MAX_MYSQL_INT) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  req.scheduleId = scheduleId;
  return next();
}

function validateCapacity(req, res, next) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "capacity") ||
    !Number.isSafeInteger(body.capacity) ||
    body.capacity <= 0 ||
    body.capacity > MAX_MYSQL_INT
  ) {
    return sendValidationError(
      res,
      "capacity must be a positive integer.",
    );
  }

  req.scheduleCapacity = body.capacity;
  return next();
}

module.exports = { validateListQuery, parseId, validateCapacity };
