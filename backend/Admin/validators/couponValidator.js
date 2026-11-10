const STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const DISCOUNT_TYPES = new Set(["PERCENT", "FIXED"]);
const MAX_MYSQL_INT = 2147483647;
const MAX_DECIMAL_INTEGER_DIGITS = 8;
const CREATE_FIELDS = new Set([
  "coupon_code",
  "description",
  "discount_type",
  "discount_value",
  "max_discount",
  "min_order_amount",
  "usage_limit",
  "start_date",
  "end_date",
  "status",
]);
const UPDATE_FIELDS = new Set([
  "coupon_code",
  "description",
  "discount_type",
  "discount_value",
  "max_discount",
  "min_order_amount",
  "usage_limit",
  "start_date",
  "end_date",
]);

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
  if (!Number.isSafeInteger(id) || id > MAX_MYSQL_INT) {
    return sendValidationError(res, "ID must be a positive integer.");
  }
  req.couponId = id;
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

function validatePageQuery(req, res, next, target) {
  const { page: rawPage, limit: rawLimit } = req.query;
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
  req[target] = { page, limit, offset: (page - 1) * limit };
  return next();
}

function validateListQuery(req, res, next) {
  const { search, status, discount_type: discountType } = req.query;
  if (
    search !== undefined &&
    (typeof search !== "string" || Array.from(search.trim()).length > 100)
  ) {
    return sendValidationError(
      res,
      "Search must be a string of at most 100 characters.",
    );
  }
  if (
    status !== undefined &&
    (typeof status !== "string" || !STATUSES.has(status))
  ) {
    return sendValidationError(res, "Status must be ACTIVE or INACTIVE.");
  }
  if (
    discountType !== undefined &&
    (typeof discountType !== "string" || !DISCOUNT_TYPES.has(discountType))
  ) {
    return sendValidationError(
      res,
      "discount_type must be PERCENT or FIXED.",
    );
  }
  const pageResult = validatePageQuery(
    req,
    res,
    () => {},
    "couponListQuery",
  );
  if (pageResult) {
    return pageResult;
  }
  Object.assign(req.couponListQuery, {
    search: typeof search === "string" ? search.trim() : "",
    status,
    discount_type: discountType,
  });
  return next();
}

function validDateTime(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.replace("T", " ");
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/,
  );
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00"] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  return true;
}

function normalizeDateTime(value) {
  return value.length === 10
    ? `${value} 00:00:00`
    : value.replace("T", " ");
}

function normalizeDecimal(value, allowZero) {
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
  if (normalizedInteger.length > MAX_DECIMAL_INTEGER_DIGITS) {
    return null;
  }
  const normalized = `${normalizedInteger}.${fractionalPart.padEnd(2, "0")}`;
  if (
    normalizedInteger === "99999999" &&
    normalized.slice(normalized.indexOf(".") + 1) > "99"
  ) {
    return null;
  }
  if (!allowZero && normalized === "0.00") {
    return null;
  }
  return normalized;
}

function isGreaterThanPercentMaximum(value) {
  const [integerPart, fractionalPart] = value.split(".");
  return Number(integerPart) > 100 ||
    (integerPart === "100" && fractionalPart !== "00");
}

function validateCouponFields(body, allowedFields, res) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendValidationError(res, "Request body must be a JSON object.");
    return false;
  }
  const keys = Object.keys(body);
  if (keys.length === 0) {
    sendValidationError(res, "At least one field is required.");
    return false;
  }
  if (keys.some((key) => !allowedFields.has(key))) {
    sendValidationError(res, "Request contains unsupported fields.");
    return false;
  }

  if (Object.hasOwn(body, "coupon_code")) {
    if (typeof body.coupon_code !== "string") {
      sendValidationError(res, "coupon_code must be a string.");
      return false;
    }
    body.coupon_code = body.coupon_code.trim();
    if (
      body.coupon_code.length === 0 ||
      Array.from(body.coupon_code).length > 50
    ) {
      sendValidationError(res, "coupon_code must contain 1 to 50 characters.");
      return false;
    }
  }
  if (
    Object.hasOwn(body, "description") &&
    body.description !== null &&
    (typeof body.description !== "string" ||
      Array.from(body.description).length > 255)
  ) {
    sendValidationError(
      res,
      "description must be null or a string of at most 255 characters.",
    );
    return false;
  }
  if (
    Object.hasOwn(body, "discount_type") &&
    !DISCOUNT_TYPES.has(body.discount_type)
  ) {
    sendValidationError(res, "discount_type must be PERCENT or FIXED.");
    return false;
  }

  for (const field of ["discount_value", "max_discount", "min_order_amount"]) {
    if (!Object.hasOwn(body, field)) {
      continue;
    }
    if (field === "max_discount" && body[field] === null) {
      continue;
    }
    const normalized = normalizeDecimal(body[field], field !== "discount_value");
    if (normalized === null) {
      sendValidationError(
        res,
        `${field} must be a valid DECIMAL(10,2) value.`,
      );
      return false;
    }
    body[field] = normalized;
  }
  if (
    Object.hasOwn(body, "discount_value") &&
    body.discount_type === "PERCENT" &&
    isGreaterThanPercentMaximum(body.discount_value)
  ) {
    sendValidationError(res, "PERCENT discount_value cannot exceed 100.");
    return false;
  }
  if (
    Object.hasOwn(body, "usage_limit") &&
    body.usage_limit !== null &&
    (!Number.isSafeInteger(body.usage_limit) ||
      body.usage_limit < 0 ||
      body.usage_limit > MAX_MYSQL_INT)
  ) {
    sendValidationError(
      res,
      "usage_limit must be null or a non-negative MySQL integer.",
    );
    return false;
  }

  for (const field of ["start_date", "end_date"]) {
    if (Object.hasOwn(body, field)) {
      if (!validDateTime(body[field])) {
        sendValidationError(
          res,
          `${field} must be a valid YYYY-MM-DD or YYYY-MM-DD HH:mm:ss date.`,
        );
        return false;
      }
      body[field] = normalizeDateTime(body[field]);
    }
  }
  if (
    body.start_date !== undefined &&
    body.end_date !== undefined &&
    body.start_date >= body.end_date
  ) {
    sendValidationError(res, "start_date must be before end_date.");
    return false;
  }
  if (
    Object.hasOwn(body, "status") &&
    !STATUSES.has(body.status)
  ) {
    sendValidationError(res, "status must be ACTIVE or INACTIVE.");
    return false;
  }
  return true;
}

function validateCreate(req, res, next) {
  if (!validateCouponFields(req.body, CREATE_FIELDS, res)) {
    return;
  }
  for (const field of [
    "coupon_code",
    "discount_type",
    "discount_value",
    "start_date",
    "end_date",
  ]) {
    if (!Object.hasOwn(req.body, field)) {
      return sendValidationError(res, `${field} is required.`);
    }
  }
  if (
    req.body.discount_type === "PERCENT" &&
    isGreaterThanPercentMaximum(req.body.discount_value)
  ) {
    return sendValidationError(res, "PERCENT discount_value cannot exceed 100.");
  }
  return next();
}

function validateUpdate(req, res, next) {
  if (!validateCouponFields(req.body, UPDATE_FIELDS, res)) {
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
    !STATUSES.has(body.status)
  ) {
    return sendValidationError(res, "status must be ACTIVE or INACTIVE.");
  }
  return next();
}

function validateUsageQuery(req, res, next) {
  return validatePageQuery(req, res, next, "couponUsageQuery");
}

module.exports = {
  parseId,
  validateListQuery,
  validateCreate,
  validateUpdate,
  validateStatus,
  validateUsageQuery,
};
