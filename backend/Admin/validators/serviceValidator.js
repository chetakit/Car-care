const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_SERVICE_FIELDS = new Set([
  "service_name",
  "description",
  "duration_minutes",
]);
const ALLOWED_PRICE_FIELDS = new Set(["vehicle_type_id", "price"]);
const MAX_MYSQL_INT = 2147483647;
const MAX_PRICE_INTEGER_DIGITS = 8;

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
  if (!Number.isSafeInteger(id) || id > MAX_MYSQL_INT) {
    return sendValidationError(res, "ID must be a positive safe integer.");
  }

  req.serviceId = id;
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
  const { page: rawPage, limit: rawLimit, search: rawSearch, status } =
    req.query;
  const page =
    rawPage === undefined ? 1 : parsePositiveInteger(rawPage);
  const limit =
    rawLimit === undefined ? 20 : parsePositiveInteger(rawLimit);

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

  if (
    status !== undefined &&
    (typeof status !== "string" || !ALLOWED_STATUSES.has(status))
  ) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }

  req.serviceListQuery = {
    page,
    limit,
    offset: (page - 1) * limit,
    search: typeof rawSearch === "string" ? rawSearch.trim() : "",
    status,
  };
  return next();
}

function validateServiceFields(body, allowedFields, res) {
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

  if (Object.hasOwn(body, "service_name")) {
    if (typeof body.service_name !== "string") {
      sendValidationError(res, "service_name must be a string.");
      return false;
    }
    body.service_name = body.service_name.trim();
    if (
      body.service_name.length === 0 ||
      Array.from(body.service_name).length > 100
    ) {
      sendValidationError(
        res,
        "service_name must contain 1 to 100 characters.",
      );
      return false;
    }
  }

  if (
    Object.hasOwn(body, "description") &&
    body.description !== null &&
    typeof body.description !== "string"
  ) {
    sendValidationError(res, "description must be a string or null.");
    return false;
  }

  if (
    Object.hasOwn(body, "duration_minutes") &&
    (!Number.isSafeInteger(body.duration_minutes) ||
      body.duration_minutes <= 0 ||
      body.duration_minutes > MAX_MYSQL_INT)
  ) {
    sendValidationError(
      res,
      "duration_minutes must be a positive integer.",
    );
    return false;
  }

  return true;
}

function validateCreate(req, res, next) {
  if (!validateServiceFields(req.body, ALLOWED_SERVICE_FIELDS, res)) {
    return;
  }
  if (!Object.hasOwn(req.body, "service_name")) {
    return sendValidationError(res, "service_name is required.");
  }
  if (!Object.hasOwn(req.body, "duration_minutes")) {
    return sendValidationError(res, "duration_minutes is required.");
  }
  return next();
}

function validateUpdate(req, res, next) {
  if (!validateServiceFields(req.body, ALLOWED_SERVICE_FIELDS, res)) {
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

function normalizePrice(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    value = String(value);
  }

  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [integerPart, fractionalPart = ""] = value.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
  if (normalizedInteger.length > MAX_PRICE_INTEGER_DIGITS) {
    return null;
  }

  return `${normalizedInteger}.${fractionalPart.padEnd(2, "0")}`;
}

function validatePrices(req, res, next) {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "prices") ||
    !Array.isArray(body.prices) ||
    body.prices.length === 0
  ) {
    return sendValidationError(
      res,
      "Request body must contain a non-empty prices array.",
    );
  }

  const seenVehicleTypeIds = new Set();
  for (const item of body.prices) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).some((field) => !ALLOWED_PRICE_FIELDS.has(field)) ||
      Object.keys(item).length !== 2 ||
      !Object.hasOwn(item, "vehicle_type_id") ||
      !Object.hasOwn(item, "price")
    ) {
      return sendValidationError(
        res,
        "Each price must contain only vehicle_type_id and price.",
      );
    }

    const { vehicle_type_id: vehicleTypeId, price } = item;
    if (
      !Number.isSafeInteger(vehicleTypeId) ||
      vehicleTypeId <= 0 ||
      vehicleTypeId > MAX_MYSQL_INT
    ) {
      return sendValidationError(
        res,
        "vehicle_type_id must be a positive MySQL integer.",
      );
    }
    if (seenVehicleTypeIds.has(vehicleTypeId)) {
      return sendValidationError(
        res,
        "vehicle_type_id values must not be duplicated.",
      );
    }
    seenVehicleTypeIds.add(vehicleTypeId);

    const normalizedPrice = normalizePrice(price);
    if (normalizedPrice === null) {
      return sendValidationError(
        res,
        "price must be a non-negative decimal with at most 2 decimal places.",
      );
    }
    item.price = normalizedPrice;
  }

  req.servicePrices = body.prices;
  return next();
}

module.exports = {
  parseId,
  validateListQuery,
  validateCreate,
  validateUpdate,
  validateStatus,
  validatePrices,
};
