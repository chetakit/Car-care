const ALLOWED_FIELDS = new Set([
  "model_id",
  "license_plate",
  "production_year",
  "province",
  "color",
]);
const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parseId(req, res, next) {
  const rawId = req.params.vehicleId;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "vehicleId must be a positive integer.");
  }
  const vehicleId = Number(rawId);
  if (!Number.isSafeInteger(vehicleId) || vehicleId > MAX_MYSQL_INT) {
    return sendValidationError(res, "vehicleId must be a positive integer.");
  }
  req.vehicleId = vehicleId;
  return next();
}

function validateFields(body, res) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendValidationError(res, "Request body must be a JSON object.");
    return null;
  }

  const fields = Object.keys(body);
  if (fields.length === 0) {
    sendValidationError(res, "At least one field is required.");
    return null;
  }
  if (fields.some((field) => !ALLOWED_FIELDS.has(field))) {
    sendValidationError(res, "Request contains unsupported fields.");
    return null;
  }

  const changes = {};
  if (Object.hasOwn(body, "model_id")) {
    if (
      !Number.isSafeInteger(body.model_id) ||
      body.model_id <= 0 ||
      body.model_id > MAX_MYSQL_INT
    ) {
      sendValidationError(res, "model_id must be a positive integer.");
      return null;
    }
    changes.model_id = body.model_id;
  }

  if (Object.hasOwn(body, "license_plate")) {
    if (typeof body.license_plate !== "string") {
      sendValidationError(res, "license_plate must be a string.");
      return null;
    }
    const licensePlate = body.license_plate.trim();
    if (licensePlate.length === 0) {
      sendValidationError(res, "license_plate must not be empty.");
      return null;
    }
    changes.license_plate = licensePlate;
  }

  if (Object.hasOwn(body, "production_year")) {
    const year = body.production_year;
    if (
      year !== null &&
      (typeof year !== "number" ||
        !Number.isInteger(year) ||
        year < 1901 ||
        year > 2155)
    ) {
      sendValidationError(
        res,
        "production_year must be an integer from 1901 to 2155 or null.",
      );
      return null;
    }
    changes.production_year = year;
  }

  for (const field of ["province", "color"]) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (
      value !== null &&
      (typeof value !== "string" || value.trim().length === 0)
    ) {
      sendValidationError(
        res,
        `${field} must be a non-empty string or null.`,
      );
      return null;
    }
    changes[field] = typeof value === "string" ? value.trim() : null;
  }

  return changes;
}

function validateCreate(req, res, next) {
  const changes = validateFields(req.body, res);
  if (!changes) return;
  for (const field of ["model_id", "license_plate"]) {
    if (!Object.hasOwn(changes, field)) {
      return sendValidationError(res, `${field} is required.`);
    }
  }
  req.vehicleInput = changes;
  return next();
}

function validateUpdate(req, res, next) {
  const changes = validateFields(req.body, res);
  if (!changes) return;
  req.vehicleChanges = changes;
  return next();
}

module.exports = { parseId, validateCreate, validateUpdate };
