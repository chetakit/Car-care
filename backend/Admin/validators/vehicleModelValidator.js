const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_CREATE_FIELDS = new Set([
  "brand_id",
  "vehicle_type_id",
  "model_name",
  "model_year_start",
  "model_year_end",
]);
const ALLOWED_UPDATE_FIELDS = new Set(ALLOWED_CREATE_FIELDS);
const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parseId(req, res, next) {
  const rawId = req.params.id;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "ID must be a positive safe integer.");
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) {
    return sendValidationError(res, "ID must be a positive safe integer.");
  }

  req.vehicleModelId = id;
  return next();
}

function parseQueryInteger(value, maximum = MAX_MYSQL_INT) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum
    ? parsed
    : null;
}

function validateListQuery(req, res, next) {
  const {
    page: rawPage,
    limit: rawLimit,
    search: rawSearch,
    brand_id: rawBrandId,
    vehicle_type_id: rawVehicleTypeId,
    status,
  } = req.query;
  const page =
    rawPage === undefined
      ? 1
      : parseQueryInteger(rawPage, Number.MAX_SAFE_INTEGER);
  const limit =
    rawLimit === undefined
      ? 20
      : parseQueryInteger(rawLimit, Number.MAX_SAFE_INTEGER);

  if (
    page === null ||
    limit === null ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    return sendValidationError(res, "Invalid pagination parameters.");
  }

  if (
    rawSearch !== undefined &&
    (typeof rawSearch !== "string" ||
      Array.from(rawSearch.trim()).length > 100)
  ) {
    return sendValidationError(
      res,
      "Search must be a string of at most 100 characters.",
    );
  }

  const brandId =
    rawBrandId === undefined ? undefined : parseQueryInteger(rawBrandId);
  if (rawBrandId !== undefined && brandId === null) {
    return sendValidationError(res, "brand_id must be a positive integer.");
  }

  const vehicleTypeId =
    rawVehicleTypeId === undefined
      ? undefined
      : parseQueryInteger(rawVehicleTypeId);
  if (rawVehicleTypeId !== undefined && vehicleTypeId === null) {
    return sendValidationError(
      res,
      "vehicle_type_id must be a positive integer.",
    );
  }

  if (
    status !== undefined &&
    (typeof status !== "string" || !ALLOWED_STATUSES.has(status))
  ) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }

  req.vehicleModelListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof rawSearch === "string" ? rawSearch.trim() : "",
    brand_id: brandId,
    vehicle_type_id: vehicleTypeId,
    status,
  };
  return next();
}

function validateFields(body, allowedFields, res) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendValidationError(res, "Request body must be a JSON object.");
    return false;
  }

  const fields = Object.keys(body);
  if (fields.some((field) => !allowedFields.has(field))) {
    sendValidationError(res, "Request contains unsupported fields.");
    return false;
  }
  if (fields.length === 0) {
    sendValidationError(res, "At least one field is required.");
    return false;
  }

  for (const field of ["brand_id", "vehicle_type_id"]) {
    if (
      Object.hasOwn(body, field) &&
      (!Number.isSafeInteger(body[field]) ||
        body[field] <= 0 ||
        body[field] > MAX_MYSQL_INT)
    ) {
      sendValidationError(res, `${field} must be a positive integer.`);
      return false;
    }
  }

  if (Object.hasOwn(body, "model_name")) {
    if (typeof body.model_name !== "string") {
      sendValidationError(res, "model_name must be a string.");
      return false;
    }
    body.model_name = body.model_name.trim();
    if (
      body.model_name.length === 0 ||
      Array.from(body.model_name).length > 100
    ) {
      sendValidationError(res, "model_name must contain 1 to 100 characters.");
      return false;
    }
  }

  for (const field of ["model_year_start", "model_year_end"]) {
    if (!Object.hasOwn(body, field) || body[field] === null) {
      continue;
    }
    if (
      typeof body[field] !== "number" ||
      !Number.isInteger(body[field]) ||
      body[field] < 1901 ||
      body[field] > 2155
    ) {
      sendValidationError(res, `${field} must be an integer from 1901 to 2155 or null.`);
      return false;
    }
  }

  if (
    body.model_year_start !== undefined &&
    body.model_year_start !== null &&
    body.model_year_end !== undefined &&
    body.model_year_end !== null &&
    body.model_year_start > body.model_year_end
  ) {
    sendValidationError(
      res,
      "model_year_start must be less than or equal to model_year_end.",
    );
    return false;
  }

  return true;
}

function validateCreate(req, res, next) {
  if (!validateFields(req.body, ALLOWED_CREATE_FIELDS, res)) {
    return;
  }
  for (const field of ["brand_id", "vehicle_type_id", "model_name"]) {
    if (!Object.hasOwn(req.body, field)) {
      return sendValidationError(res, `${field} is required.`);
    }
  }
  return next();
}

function validateUpdate(req, res, next) {
  if (!validateFields(req.body, ALLOWED_UPDATE_FIELDS, res)) {
    return;
  }
  return next();
}

function validateStatus(req, res, next) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "status") ||
    !ALLOWED_STATUSES.has(body.status)
  ) {
    return sendValidationError(res, "status must be ACTIVE or INACTIVE.");
  }
  return next();
}

module.exports = {
  parseId,
  validateListQuery,
  validateCreate,
  validateUpdate,
  validateStatus,
};
