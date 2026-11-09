const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_FIELDS = new Set(["brand_name"]);

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

  req.vehicleBrandId = id;
  return next();
}

function validateListQuery(req, res, next) {
  const { page: rawPage, limit: rawLimit, search: rawSearch, status } = req.query;
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);

  if (
    (rawPage !== undefined &&
      (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage))) ||
    !Number.isSafeInteger(page) ||
    (rawLimit !== undefined &&
      (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit))) ||
    !Number.isSafeInteger(limit) ||
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
    return sendValidationError(res, "Search must be a string of at most 100 characters.");
  }

  if (
    status !== undefined &&
    (typeof status !== "string" || !ALLOWED_STATUSES.has(status))
  ) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }

  req.vehicleBrandListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof rawSearch === "string" ? rawSearch.trim() : "",
    status,
  };
  return next();
}

function validateBrandName(body, res) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendValidationError(res, "Request body must be a JSON object.");
    return false;
  }

  const keys = Object.keys(body);
  if (keys.some((key) => !ALLOWED_FIELDS.has(key))) {
    sendValidationError(res, "Request contains unsupported fields.");
    return false;
  }

  if (!Object.hasOwn(body, "brand_name") || typeof body.brand_name !== "string") {
    sendValidationError(res, "brand_name is required and must be a string.");
    return false;
  }

  body.brand_name = body.brand_name.trim();
  if (
    body.brand_name.length === 0 ||
    Array.from(body.brand_name).length > 100
  ) {
    sendValidationError(res, "brand_name must contain 1 to 100 characters.");
    return false;
  }

  return true;
}

function validateCreate(req, res, next) {
  if (!validateBrandName(req.body, res)) {
    return;
  }
  return next();
}

function validateUpdate(req, res, next) {
  if (!validateBrandName(req.body, res)) {
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
