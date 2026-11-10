const ROLES = new Set(["ADMIN", "CUSTOMER", "STAFF"]);
const STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_UPDATE_FIELDS = new Set(["full_name", "email", "phone"]);
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
    return sendValidationError(res, "ID must be a positive integer.");
  }
  const userId = Number(rawId);
  if (!Number.isSafeInteger(userId) || userId > MAX_MYSQL_INT) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  req.userId = userId;
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
  const { page: rawPage, limit: rawLimit, search, role, status } = req.query;
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
    (typeof search !== "string" ||
      Array.from(search.trim()).length > 100)
  ) {
    return sendValidationError(
      res,
      "Search must be a string of at most 100 characters.",
    );
  }
  if (role !== undefined && (typeof role !== "string" || !ROLES.has(role))) {
    return sendValidationError(res, "Invalid role.");
  }
  if (
    status !== undefined &&
    (typeof status !== "string" || !STATUSES.has(status))
  ) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }

  req.userListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof search === "string" ? search.trim() : "",
    role,
    status,
  };
  return next();
}

function validateUpdate(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendValidationError(res, "Request body must be a JSON object.");
  }
  const keys = Object.keys(body);
  if (keys.length === 0) {
    return sendValidationError(res, "At least one field is required.");
  }
  if (keys.some((key) => !ALLOWED_UPDATE_FIELDS.has(key))) {
    return sendValidationError(res, "Request contains unsupported fields.");
  }

  if (Object.hasOwn(body, "full_name")) {
    if (typeof body.full_name !== "string") {
      return sendValidationError(res, "full_name must be a string.");
    }
    body.full_name = body.full_name.trim();
    if (
      body.full_name.length === 0 ||
      Array.from(body.full_name).length > 100
    ) {
      return sendValidationError(
        res,
        "full_name must contain 1 to 100 characters.",
      );
    }
  }

  if (Object.hasOwn(body, "email")) {
    if (typeof body.email !== "string") {
      return sendValidationError(res, "email must be a string.");
    }
    body.email = body.email.trim();
    if (
      body.email.length === 0 ||
      body.email.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
    ) {
      return sendValidationError(res, "email must be a valid email address.");
    }
  }

  if (
    Object.hasOwn(body, "phone") &&
    body.phone !== null &&
    (typeof body.phone !== "string" ||
      body.phone.trim().length === 0 ||
      body.phone.trim().length > 20)
  ) {
    return sendValidationError(
      res,
      "phone must be null or a string of 1 to 20 characters.",
    );
  }
  if (typeof body.phone === "string") {
    body.phone = body.phone.trim();
  }
  return next();
}

function validateRole(req, res, next) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "role") ||
    !ROLES.has(body.role)
  ) {
    return sendValidationError(res, "role must be ADMIN, CUSTOMER, or STAFF.");
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
    !STATUSES.has(body.status)
  ) {
    return sendValidationError(res, "status must be ACTIVE or INACTIVE.");
  }
  return next();
}

module.exports = {
  parseId,
  validateListQuery,
  validateUpdate,
  validateRole,
  validateStatus,
};
