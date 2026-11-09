const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_CREATE_FIELDS = new Set(["type_name", "description"]);
const ALLOWED_UPDATE_FIELDS = new Set(["type_name", "description"]);

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parseId(req, res, next) {
  const rawId = req.params.id;
  if (!/^[1-9]\d*$/.test(rawId)) {
    return sendValidationError(res, "ID must be a positive integer.");
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) {
    return sendValidationError(res, "ID must be a positive integer.");
  }

  req.vehicleTypeId = id;
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
      Array.from(rawSearch.trim()).length > 50)
  ) {
    return sendValidationError(res, "Search must be a string of at most 50 characters.");
  }

  if (status !== undefined && (typeof status !== "string" || !ALLOWED_STATUSES.has(status))) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }

  req.vehicleTypeListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof rawSearch === "string" ? rawSearch.trim() : "",
    status,
  };
  return next();
}

function validateFields(body, allowedFields, res) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendValidationError(res, "Request body must be a JSON object.");
    return false;
  }

  const keys = Object.keys(body);
  if (keys.some((key) => !allowedFields.has(key))) {
    sendValidationError(res, "Request contains unsupported fields.");
    return false;
  }

  if (keys.length === 0) {
    sendValidationError(res, "At least one field is required.");
    return false;
  }

  if (Object.hasOwn(body, "type_name")) {
    if (typeof body.type_name !== "string") {
      sendValidationError(res, "type_name must be a string.");
      return false;
    }

    body.type_name = body.type_name.trim();
    if (
      body.type_name.length === 0 ||
      Array.from(body.type_name).length > 50
    ) {
      sendValidationError(res, "type_name must contain 1 to 50 characters.");
      return false;
    }
  }

  if (
    Object.hasOwn(body, "description") &&
    body.description !== null &&
    (typeof body.description !== "string" ||
      Array.from(body.description).length > 255)
  ) {
    sendValidationError(res, "description must be null or a string of at most 255 characters.");
    return false;
  }

  return true;
}

function validateCreate(req, res, next) {
  if (!validateFields(req.body, ALLOWED_CREATE_FIELDS, res)) {
    return;
  }
  if (!Object.hasOwn(req.body, "type_name")) {
    return sendValidationError(res, "type_name is required.");
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
