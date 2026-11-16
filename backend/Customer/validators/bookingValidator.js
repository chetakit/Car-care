const { normalizeCouponCode } = require("../../shared/services/couponPricing");

const ALLOWED_FIELDS = new Set([
  "vehicle_id",
  "schedule_id",
  "service_ids",
  "coupon_code",
]);
const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function isPositiveMySqlInteger(value) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_MYSQL_INT
  );
}

function validateCreate(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendValidationError(res, "Request body must be a JSON object.");
  }

  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    return sendValidationError(res, "Request contains unsupported fields.");
  }

  if (!isPositiveMySqlInteger(body.vehicle_id)) {
    return sendValidationError(res, "vehicle_id must be a positive integer.");
  }
  if (!isPositiveMySqlInteger(body.schedule_id)) {
    return sendValidationError(res, "schedule_id must be a positive integer.");
  }
  if (!Array.isArray(body.service_ids) || body.service_ids.length === 0) {
    return sendValidationError(
      res,
      "service_ids must be a non-empty array.",
    );
  }

  const seenServiceIds = new Set();
  for (const serviceId of body.service_ids) {
    if (!isPositiveMySqlInteger(serviceId)) {
      return sendValidationError(
        res,
        "Each service_id must be a positive integer.",
      );
    }
    if (seenServiceIds.has(serviceId)) {
      return sendValidationError(
        res,
        "service_ids must not contain duplicates.",
      );
    }
    seenServiceIds.add(serviceId);
  }

  let couponCode = null;
  if (body.coupon_code !== undefined && body.coupon_code !== null && body.coupon_code !== "") {
    couponCode = normalizeCouponCode(body.coupon_code);
    if (!couponCode) {
      return sendValidationError(res, "coupon_code must be a code of 1 to 50 characters.");
    }
  }

  req.bookingInput = {
    vehicle_id: body.vehicle_id,
    schedule_id: body.schedule_id,
    service_ids: [...body.service_ids],
    ...(couponCode ? { coupon_code: couponCode } : {}),
  };
  return next();
}

module.exports = { validateCreate };
