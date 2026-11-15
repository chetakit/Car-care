const MAX_MYSQL_INT = 2147483647;
const MODEL_FILTERS = new Set(["brand_id", "vehicle_type_id"]);

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

function validateNoQuery(req, res, next) {
  if (Object.keys(req.query).length > 0) {
    return sendValidationError(res, "This catalog endpoint does not accept query parameters.");
  }
  return next();
}

function validateModelFilters(req, res, next) {
  const filters = {};
  for (const [field, value] of Object.entries(req.query)) {
    if (!MODEL_FILTERS.has(field)) {
      return sendValidationError(res, "Request contains unsupported query parameters.");
    }

    const parsed = parsePositiveInteger(value);
    if (parsed === null) {
      return sendValidationError(res, `${field} must be a positive integer.`);
    }
    filters[field] = parsed;
  }

  req.vehicleModelFilters = filters;
  return next();
}

module.exports = { validateNoQuery, validateModelFilters };
