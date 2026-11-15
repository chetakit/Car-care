const ALLOWED_QUERY_FIELDS = new Set(["from", "to"]);

function isValidDate(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1000 || month < 1 || month > 12) {
    return false;
  }

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function validateAvailabilityQuery(req, res, next) {
  if (
    Object.keys(req.query).some((field) => !ALLOWED_QUERY_FIELDS.has(field))
  ) {
    return sendValidationError(
      res,
      "Only from and to query parameters are supported.",
    );
  }

  const { from, to } = req.query;
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

module.exports = { validateAvailabilityQuery };
