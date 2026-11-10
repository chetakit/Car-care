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

function validateQuery(req, res, next) {
  const { date_from: dateFrom, date_to: dateTo, group_by: groupBy } = req.query;
  if (dateFrom !== undefined && !isValidDate(dateFrom)) {
    return sendValidationError(res, "date_from must be a valid YYYY-MM-DD date.");
  }
  if (dateTo !== undefined && !isValidDate(dateTo)) {
    return sendValidationError(res, "date_to must be a valid YYYY-MM-DD date.");
  }
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    return sendValidationError(res, "date_from must not be after date_to.");
  }
  if (
    groupBy !== undefined &&
    groupBy !== "day" &&
    groupBy !== "month"
  ) {
    return sendValidationError(res, "group_by must be day or month.");
  }
  req.reportQuery = {
    date_from: dateFrom,
    date_to: dateTo,
    group_by: groupBy || "day",
  };
  return next();
}

module.exports = { validateQuery, isValidDate };
